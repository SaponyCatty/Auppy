use std::process::Stdio;
use std::time::Duration;

use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command;
use tokio::sync::mpsc;
use tokio::sync::watch;
use tokio::task::JoinHandle;

use crate::models::ScriptRecord;

const MIN_TIMEOUT_SECONDS: i64 = 1;
const MAX_TIMEOUT_SECONDS: i64 = 3_600;
const MIN_OUTPUT_LIMIT_BYTES: i64 = 1_024;
const MAX_OUTPUT_LIMIT_BYTES: i64 = 1_048_576;

pub struct ProcessResult {
    pub status: String,
    pub exit_code: Option<i32>,
    pub stdout: Option<String>,
    pub stderr: Option<String>,
    pub error_message: Option<String>,
    pub stdout_truncated: bool,
    pub stderr_truncated: bool,
}

#[derive(Debug, Clone)]
pub struct OutputChunk {
    pub stream: String,
    pub content: String,
}

struct LimitedOutput {
    content: Option<String>,
    truncated: bool,
}

enum WaitOutcome {
    Finished(std::io::Result<std::process::ExitStatus>),
    Canceled,
    Timeout,
}

pub async fn run_python_script(
    script: &ScriptRecord,
    cancel_rx: watch::Receiver<bool>,
    output_tx: Option<mpsc::UnboundedSender<OutputChunk>>,
) -> ProcessResult {
    let mut command = Command::new(script.interpreter_path.trim());
    command.arg(&script.file_path);
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    command.kill_on_drop(true);

    if let Some(working_directory) = script.working_directory.as_deref() {
        let trimmed = working_directory.trim();
        if !trimmed.is_empty() {
            command.current_dir(trimmed);
        }
    }

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return ProcessResult {
                status: "error".to_string(),
                exit_code: None,
                stdout: None,
                stderr: None,
                error_message: Some(error.to_string()),
                stdout_truncated: false,
                stderr_truncated: false,
            };
        }
    };

    let output_limit = script
        .output_limit_bytes
        .clamp(MIN_OUTPUT_LIMIT_BYTES, MAX_OUTPUT_LIMIT_BYTES) as usize;
    let timeout = Duration::from_secs(
        script
            .timeout_seconds
            .clamp(MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS) as u64,
    );

    let stdout_task = child.stdout.take().map(|stdout| {
        tokio::spawn(read_limited(
            stdout,
            output_limit,
            "stdout",
            output_tx.clone(),
        ))
    });
    let stderr_task = child
        .stderr
        .take()
        .map(|stderr| tokio::spawn(read_limited(stderr, output_limit, "stderr", output_tx)));

    let outcome = wait_for_child(&mut child, cancel_rx, timeout).await;
    let stdout = join_limited(stdout_task).await;
    let stderr = join_limited(stderr_task).await;

    match outcome {
        WaitOutcome::Finished(Ok(status)) => {
            let status_text = if status.success() {
                "success"
            } else {
                "failed"
            };

            ProcessResult {
                status: status_text.to_string(),
                exit_code: status.code(),
                stdout: stdout.content,
                stderr: stderr.content,
                error_message: None,
                stdout_truncated: stdout.truncated,
                stderr_truncated: stderr.truncated,
            }
        }
        WaitOutcome::Finished(Err(error)) => ProcessResult {
            status: "error".to_string(),
            exit_code: None,
            stdout: stdout.content,
            stderr: stderr.content,
            error_message: Some(error.to_string()),
            stdout_truncated: stdout.truncated,
            stderr_truncated: stderr.truncated,
        },
        WaitOutcome::Canceled => ProcessResult {
            status: "canceled".to_string(),
            exit_code: None,
            stdout: stdout.content,
            stderr: stderr.content,
            error_message: Some("Script was stopped by the user".to_string()),
            stdout_truncated: stdout.truncated,
            stderr_truncated: stderr.truncated,
        },
        WaitOutcome::Timeout => ProcessResult {
            status: "timeout".to_string(),
            exit_code: None,
            stdout: stdout.content,
            stderr: stderr.content,
            error_message: Some(format!(
                "Script timed out after {} seconds",
                script
                    .timeout_seconds
                    .clamp(MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS)
            )),
            stdout_truncated: stdout.truncated,
            stderr_truncated: stderr.truncated,
        },
    }
}

async fn wait_for_child(
    child: &mut tokio::process::Child,
    cancel_rx: watch::Receiver<bool>,
    timeout: Duration,
) -> WaitOutcome {
    tokio::select! {
        status = child.wait() => WaitOutcome::Finished(status),
        _ = wait_for_cancel(cancel_rx) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            WaitOutcome::Canceled
        }
        _ = tokio::time::sleep(timeout) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            WaitOutcome::Timeout
        }
    }
}

async fn wait_for_cancel(mut cancel_rx: watch::Receiver<bool>) {
    loop {
        if *cancel_rx.borrow() {
            return;
        }

        if cancel_rx.changed().await.is_err() {
            return;
        }
    }
}

async fn read_limited<R>(
    mut reader: R,
    limit: usize,
    stream: &str,
    output_tx: Option<mpsc::UnboundedSender<OutputChunk>>,
) -> LimitedOutput
where
    R: AsyncRead + Unpin,
{
    let mut content = Vec::new();
    let mut buffer = [0_u8; 8192];
    let mut truncated = false;

    loop {
        let read = match reader.read(&mut buffer).await {
            Ok(read) => read,
            Err(error) => {
                let mut message =
                    format!("\n[Could not read process output: {error}]").into_bytes();
                content.append(&mut message);
                truncated = true;
                break;
            }
        };

        if read == 0 {
            break;
        }

        if content.len() < limit {
            let remaining = limit - content.len();
            let to_take = read.min(remaining);
            content.extend_from_slice(&buffer[..to_take]);
            if let Some(output_tx) = output_tx.as_ref() {
                let _ = output_tx.send(OutputChunk {
                    stream: stream.to_string(),
                    content: String::from_utf8_lossy(&buffer[..to_take]).to_string(),
                });
            }

            if to_take < read {
                truncated = true;
            }
        } else {
            truncated = true;
        }
    }

    LimitedOutput {
        content: bytes_to_optional_string(content),
        truncated,
    }
}

async fn join_limited(task: Option<JoinHandle<LimitedOutput>>) -> LimitedOutput {
    let Some(task) = task else {
        return LimitedOutput {
            content: None,
            truncated: false,
        };
    };

    task.await.unwrap_or(LimitedOutput {
        content: Some("[Could not join output reader]".to_string()),
        truncated: true,
    })
}

fn bytes_to_optional_string(bytes: Vec<u8>) -> Option<String> {
    if bytes.is_empty() {
        None
    } else {
        Some(String::from_utf8_lossy(&bytes).to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ScriptRecord;
    use tokio::sync::watch;
    use uuid::Uuid;

    fn python_path() -> Option<String> {
        std::process::Command::new("python3")
            .arg("--version")
            .output()
            .ok()
            .map(|_| "python3".to_string())
    }

    fn script_record(path: String, timeout_seconds: i64, output_limit_bytes: i64) -> ScriptRecord {
        ScriptRecord {
            id: Uuid::new_v4().to_string(),
            name: "Test".to_string(),
            workspace: "Default".to_string(),
            file_path: path,
            interpreter_path: python_path().unwrap_or_else(|| "python3".to_string()),
            working_directory: None,
            run_on_app_start: false,
            is_enabled: true,
            timeout_seconds,
            output_limit_bytes,
            is_trusted: false,
            category: None,
            tags: Vec::new(),
            is_favorite: false,
            safety_level: "low".to_string(),
            safety_warnings: Vec::new(),
            created_at: "now".to_string(),
            updated_at: "now".to_string(),
        }
    }

    fn write_temp_script(content: &str) -> String {
        let path = std::env::temp_dir().join(format!("auppy-runner-{}.py", Uuid::new_v4()));
        std::fs::write(&path, content).expect("write temp script");
        path.to_string_lossy().to_string()
    }

    #[tokio::test]
    async fn truncates_large_output() {
        if python_path().is_none() {
            return;
        }

        let path = write_temp_script("print('x' * 5000)");
        let (_cancel_tx, cancel_rx) = watch::channel(false);
        let result = run_python_script(&script_record(path, 10, 1024), cancel_rx, None).await;

        assert_eq!(result.status, "success");
        assert!(result.stdout_truncated);
        assert!(result.stdout.unwrap_or_default().len() <= 1024);
    }

    #[tokio::test]
    async fn times_out_long_script() {
        if python_path().is_none() {
            return;
        }

        let path = write_temp_script("import time\ntime.sleep(5)");
        let (_cancel_tx, cancel_rx) = watch::channel(false);
        let result = run_python_script(&script_record(path, 1, 4096), cancel_rx, None).await;

        assert_eq!(result.status, "timeout");
    }
}
