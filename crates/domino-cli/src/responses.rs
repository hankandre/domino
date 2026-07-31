use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Page {
    pub(crate) limit: u64,
    pub(crate) offset: u64,
    pub(crate) has_more: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Product {
    pub(crate) id: String,
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) brand: Option<String>,
    #[serde(default)]
    pub(crate) model: Option<String>,
    #[serde(default)]
    pub(crate) category: Option<String>,
    #[serde(flatten)]
    pub(crate) related: Map<String, Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct ProductResponse {
    pub(crate) product: Product,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProductListResponse {
    pub(crate) products: Vec<Product>,
    pub(crate) total: u64,
    pub(crate) total_is_exact: bool,
    pub(crate) page: Page,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Claim {
    pub(crate) id: String,
    pub(crate) product_id: String,
    pub(crate) status: String,
    pub(crate) issue: String,
    #[serde(default)]
    pub(crate) reference: Option<String>,
    #[serde(flatten)]
    pub(crate) details: Map<String, Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct ClaimResponse {
    pub(crate) claim: Claim,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct ClaimListResponse {
    pub(crate) claims: Vec<Claim>,
    pub(crate) page: Page,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RequiredEvidence {
    pub(crate) label: String,
    pub(crate) required: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClaimInstruction {
    pub(crate) title: String,
    #[serde(default)]
    pub(crate) detail: Option<String>,
    pub(crate) required: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct Warranty {
    pub(crate) id: String,
    #[serde(rename = "productId")]
    pub(crate) product_id: String,
    #[serde(default)]
    pub(crate) provider: Option<String>,
    #[serde(default, rename = "submissionMethods")]
    pub(crate) submission_methods: Vec<String>,
    #[serde(default, rename = "requiredEvidence")]
    pub(crate) required_evidence: Vec<RequiredEvidence>,
    #[serde(default, rename = "claimInstructions")]
    pub(crate) claim_instructions: Vec<ClaimInstruction>,
    #[serde(flatten)]
    pub(crate) terms: Map<String, Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct WarrantyResponse {
    pub(crate) warranty: Warranty,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Note {
    pub(crate) id: String,
    pub(crate) body: String,
    #[serde(default)]
    pub(crate) product_id: Option<String>,
    #[serde(default)]
    pub(crate) claim_id: Option<String>,
    #[serde(flatten)]
    pub(crate) metadata: Map<String, Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct NoteResponse {
    pub(crate) note: Note,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct NoteListResponse {
    pub(crate) notes: Vec<Note>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Document {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) kind: String,
    pub(crate) backend: String,
    #[serde(default)]
    pub(crate) product_id: Option<String>,
    #[serde(default)]
    pub(crate) claim_id: Option<String>,
    #[serde(flatten)]
    pub(crate) metadata: Map<String, Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct DocumentResponse {
    pub(crate) document: Document,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct DocumentListResponse {
    pub(crate) documents: Vec<Document>,
    #[serde(default)]
    pub(crate) page: Option<Page>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Actor {
    pub(crate) id: String,
    pub(crate) kind: String,
    pub(crate) household_id: String,
    pub(crate) permissions: Vec<String>,
    #[serde(flatten)]
    pub(crate) access: Map<String, Value>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct IdentityResponse {
    pub(crate) actor: Actor,
}

pub(crate) fn as_value<T: Serialize>(response: T) -> crate::Result<Value> {
    Ok(serde_json::to_value(response)?)
}
