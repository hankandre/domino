use reqwest::Method;
use serde_json::Value;

use crate::{
    Result,
    api::invoke_typed,
    commands::{Cli, SearchArgs},
    responses::{ProductListResponse, as_value},
};

pub(crate) async fn run_search(cli: &Cli, args: &SearchArgs) -> Result<Value> {
    let limit = args.limit.to_string();
    let offset = args.offset.to_string();
    let mut pairs = vec![("limit", limit.as_str()), ("offset", offset.as_str())];

    if let Some(value) = args.query.as_deref() {
        pairs.push(("q", value));
    }
    if let Some(value) = args.coverage.as_deref() {
        pairs.push(("coverage", value));
    }
    if args.has_claim {
        pairs.push(("hasClaim", "true"));
    }
    if let Some(value) = args.purchased_after.as_deref() {
        pairs.push(("purchasedAfter", value));
    }
    if let Some(value) = args.purchased_before.as_deref() {
        pairs.push(("purchasedBefore", value));
    }
    if let Some(value) = args.expires_after.as_deref() {
        pairs.push(("expiresAfter", value));
    }
    if let Some(value) = args.expires_before.as_deref() {
        pairs.push(("expiresBefore", value));
    }
    if args.include_archived {
        pairs.push(("includeArchived", "true"));
    }

    let query = url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(pairs)
        .finish();
    as_value(
        invoke_typed::<ProductListResponse>(
            cli,
            Method::GET,
            &format!("/api/v1/products?{query}"),
            None,
        )
        .await?,
    )
}
