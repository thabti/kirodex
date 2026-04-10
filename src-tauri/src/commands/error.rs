use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Git error: {0}")]
    Git(#[from] git2::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Config error: {0}")]
    Confy(#[from] confy::ConfyError),
    #[error("Task not found: {0}")]
    TaskNotFound(String),
    #[error("Lock poisoned")]
    LockPoisoned,
    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        Self::Other(s)
    }
}

impl<T> From<std::sync::PoisonError<T>> for AppError {
    fn from(_: std::sync::PoisonError<T>) -> Self {
        Self::LockPoisoned
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_string_creates_other_variant() {
        let err: AppError = "something broke".to_string().into();
        assert_eq!(err.to_string(), "something broke");
    }

    #[test]
    fn from_io_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "missing");
        let err: AppError = io_err.into();
        assert!(err.to_string().contains("IO error"));
    }

    #[test]
    fn from_json_error() {
        let json_err = serde_json::from_str::<serde_json::Value>("invalid").unwrap_err();
        let err: AppError = json_err.into();
        assert!(err.to_string().contains("JSON error"));
    }

    #[test]
    fn task_not_found_display() {
        let err = AppError::TaskNotFound("abc-123".to_string());
        assert_eq!(err.to_string(), "Task not found: abc-123");
    }

    #[test]
    fn lock_poisoned_display() {
        let err = AppError::LockPoisoned;
        assert_eq!(err.to_string(), "Lock poisoned");
    }

    #[test]
    fn serializes_as_string() {
        let err = AppError::Other("test error".to_string());
        let json = serde_json::to_string(&err).unwrap();
        assert_eq!(json, "\"test error\"");
    }
}
