use crate::models::SafetyReport;

pub fn scan_script(content: &str) -> SafetyReport {
    let lowered = content.to_lowercase();
    let mut warnings = Vec::new();
    let mut high_risk = false;
    let mut medium_risk = false;

    if contains_any(
        &lowered,
        &[
            "rm -rf",
            "shutil.rmtree",
            "os.remove",
            "os.unlink",
            ".unlink(",
            ".rmdir(",
        ],
    ) {
        warnings.push("Deletes files or directories".to_string());
        high_risk = true;
    }

    if contains_any(
        &lowered,
        &[
            "subprocess.",
            "os.system",
            "os.popen",
            "shell=true",
            "pty.spawn",
        ],
    ) {
        warnings.push("Runs shell commands or child processes".to_string());
        high_risk = true;
    }

    if contains_any(
        &lowered,
        &[
            "socket.",
            "requests.",
            "urllib.request",
            "http.client",
            "ftplib.",
            "smtplib.",
        ],
    ) {
        warnings.push("May access the network".to_string());
        medium_risk = true;
    }

    if contains_any(&lowered, &["chmod(", "chown(", "os.chmod", "os.chown"]) {
        warnings.push("Changes file permissions or ownership".to_string());
        medium_risk = true;
    }

    let level = if high_risk {
        "high"
    } else if medium_risk {
        "medium"
    } else {
        "low"
    };

    SafetyReport {
        level: level.to_string(),
        warnings,
    }
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| haystack.contains(needle))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flags_destructive_and_shell_patterns() {
        let report = scan_script("import os\nos.system('rm -rf /tmp/example')");

        assert_eq!(report.level, "high");
        assert!(report
            .warnings
            .iter()
            .any(|warning| warning.contains("Deletes")));
        assert!(report
            .warnings
            .iter()
            .any(|warning| warning.contains("shell")));
    }

    #[test]
    fn treats_simple_print_script_as_low_risk() {
        let report = scan_script("print('hello')");

        assert_eq!(report.level, "low");
        assert!(report.warnings.is_empty());
    }
}
