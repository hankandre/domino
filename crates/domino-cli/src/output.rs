use serde_json::Value;

use crate::errors::RemoteError;

pub(crate) fn compact_json(mut value: Value) -> Value {
    match &mut value {
        Value::Object(map) => {
            map.retain(|_, child| !child.is_null());
            for child in map.values_mut() {
                *child = compact_json(std::mem::take(child));
            }
        }
        Value::Array(items) => {
            for child in items {
                *child = compact_json(std::mem::take(child));
            }
        }
        _ => {}
    }
    value
}

pub(crate) fn print_value(value: &Value, json_output: bool) {
    if json_output {
        println!(
            "{}",
            serde_json::to_string_pretty(value).expect("serializable response")
        );
    } else if let Some(text) = value.as_str() {
        println!("{text}");
    } else {
        println!(
            "{}",
            serde_json::to_string_pretty(value).expect("serializable response")
        );
    }
}

pub(crate) fn print_error(
    error: &(dyn std::error::Error + Send + Sync + 'static),
    json_output: bool,
) {
    if json_output {
        let value = error
            .downcast_ref::<RemoteError>()
            .map(|remote| serde_json::to_value(remote).expect("serializable remote error"))
            .unwrap_or_else(|| serde_json::json!({ "error": error.to_string() }));
        eprintln!(
            "{}",
            serde_json::to_string_pretty(&value).expect("serializable CLI error")
        );
    } else {
        eprintln!("{error}");
    }
}
