use clap::{Args, Parser, Subcommand};
use std::path::PathBuf;

use crate::config::{default_credential_file, default_socket};

#[derive(Parser)]
#[command(
    name = "domino",
    version,
    about = "Search and manage a Domino household warranty library"
)]
pub(crate) struct Cli {
    #[arg(long, env = "DOMINO_SERVER")]
    pub(crate) server: Option<String>,
    #[arg(long, env = "DOMINO_BROKER_SOCKET")]
    pub(crate) socket: Option<PathBuf>,
    #[arg(long, default_value_os_t = default_credential_file())]
    pub(crate) credential_file: PathBuf,
    #[arg(long, global = true)]
    pub(crate) json: bool,
    #[command(subcommand)]
    pub(crate) command: Command,
}

#[derive(Subcommand)]
pub(crate) enum Command {
    Auth {
        #[command(subcommand)]
        command: AuthCommand,
    },
    Search(SearchArgs),
    Product {
        #[command(subcommand)]
        command: ProductCommand,
    },
    Warranty {
        #[command(subcommand)]
        command: WarrantyCommand,
    },
    Claim {
        #[command(subcommand)]
        command: ClaimCommand,
    },
    Note {
        #[command(subcommand)]
        command: NoteCommand,
    },
    Document {
        #[command(subcommand)]
        command: DocumentCommand,
    },
    Record {
        #[command(subcommand)]
        command: RecordCommand,
    },
    Whoami,
    Broker {
        #[command(subcommand)]
        command: BrokerCommand,
    },
}

#[derive(Subcommand)]
pub(crate) enum AuthCommand {
    Login {
        #[arg(long, default_value = "Domino CLI")]
        name: String,
        #[arg(long)]
        no_open: bool,
    },
}

#[derive(Args)]
pub(crate) struct SearchArgs {
    pub(crate) query: Option<String>,
    #[arg(long, default_value_t = 100, value_parser = clap::value_parser!(u16).range(1..=200))]
    pub(crate) limit: u16,
    #[arg(long, default_value_t = 0)]
    pub(crate) offset: u32,
    #[arg(long)]
    pub(crate) coverage: Option<String>,
    #[arg(long)]
    pub(crate) has_claim: bool,
    #[arg(long)]
    pub(crate) purchased_after: Option<String>,
    #[arg(long)]
    pub(crate) purchased_before: Option<String>,
    #[arg(long)]
    pub(crate) expires_after: Option<String>,
    #[arg(long)]
    pub(crate) expires_before: Option<String>,
    #[arg(long)]
    pub(crate) include_archived: bool,
}

#[derive(Subcommand)]
pub(crate) enum ProductCommand {
    Get {
        id: String,
    },
    Create {
        name: String,
        #[arg(long)]
        brand: Option<String>,
        #[arg(long)]
        model: Option<String>,
        #[arg(long)]
        category: Option<String>,
        #[arg(long)]
        serial: Vec<String>,
        #[arg(long)]
        retailer: Option<String>,
        #[arg(long)]
        order_number: Option<String>,
        #[arg(long)]
        purchased_at: Option<String>,
        #[arg(long)]
        warranty_ends_at: Option<String>,
    },
    Update {
        id: String,
        #[arg(long)]
        name: Option<String>,
        #[arg(long)]
        brand: Option<String>,
        #[arg(long)]
        model: Option<String>,
        #[arg(long)]
        category: Option<String>,
        #[arg(long)]
        serial: Vec<String>,
        #[arg(long)]
        retailer: Option<String>,
        #[arg(long)]
        order_number: Option<String>,
        #[arg(long)]
        purchased_at: Option<String>,
    },
    Archive {
        id: String,
    },
    Restore {
        id: String,
    },
}

#[derive(Subcommand)]
pub(crate) enum WarrantyCommand {
    Add {
        product_id: String,
        #[arg(long)]
        provider: Option<String>,
        #[arg(long)]
        starts_at: Option<String>,
        #[arg(long)]
        ends_at: Option<String>,
        #[arg(long)]
        lifetime: bool,
        #[arg(long)]
        claim_url: Option<String>,
        #[arg(long)]
        claim_phone: Option<String>,
        #[arg(long)]
        claim_email: Option<String>,
        #[arg(long)]
        eligibility_notes: Option<String>,
        #[arg(long)]
        claim_deadline: Option<String>,
        #[arg(
            long = "submission-method",
            value_parser = ["web", "phone", "email", "mail", "in_person"]
        )]
        submission_methods: Vec<String>,
        #[arg(long = "required-evidence")]
        required_evidence: Vec<String>,
        #[arg(long = "optional-evidence")]
        optional_evidence: Vec<String>,
        #[arg(long = "instruction")]
        instructions: Vec<String>,
        #[arg(long = "optional-instruction")]
        optional_instructions: Vec<String>,
    },
    Update {
        id: String,
        #[arg(long)]
        provider: Option<String>,
        #[arg(long)]
        ends_at: Option<String>,
        #[arg(long)]
        lifetime: Option<bool>,
        #[arg(long)]
        claim_url: Option<String>,
        #[arg(long)]
        claim_phone: Option<String>,
        #[arg(long)]
        claim_email: Option<String>,
        #[arg(long)]
        eligibility_notes: Option<String>,
        #[arg(long)]
        claim_deadline: Option<String>,
        #[arg(
            long = "submission-method",
            value_parser = ["web", "phone", "email", "mail", "in_person"]
        )]
        submission_methods: Vec<String>,
        #[arg(long = "required-evidence")]
        required_evidence: Vec<String>,
        #[arg(long = "optional-evidence")]
        optional_evidence: Vec<String>,
        #[arg(long = "instruction")]
        instructions: Vec<String>,
        #[arg(long = "optional-instruction")]
        optional_instructions: Vec<String>,
    },
    Delete {
        id: String,
    },
}

#[derive(Subcommand)]
pub(crate) enum ClaimCommand {
    List,
    Get {
        id: String,
    },
    Create {
        product_id: String,
        #[arg(long)]
        issue: String,
        #[arg(long)]
        next_action: Option<String>,
        #[arg(long)]
        noticed_at: Option<String>,
        #[arg(long)]
        preferred_resolution: Option<String>,
    },
    Update {
        id: String,
        #[arg(long)]
        status: Option<String>,
        #[arg(long)]
        next_action: Option<String>,
        #[arg(long)]
        resolution: Option<String>,
        #[arg(long)]
        explanation: Option<String>,
    },
}

#[derive(Subcommand)]
pub(crate) enum NoteCommand {
    List { product_id: String },
    Add { product_id: String, body: String },
    ListClaim { claim_id: String },
    AddClaim { claim_id: String, body: String },
}

#[derive(Subcommand)]
pub(crate) enum DocumentCommand {
    List {
        #[arg(long)]
        trash: bool,
    },
    Upload {
        path: PathBuf,
        #[arg(long)]
        name: Option<String>,
        #[arg(long)]
        product_id: Option<String>,
        #[arg(long)]
        claim_id: Option<String>,
        #[arg(long, default_value = "other")]
        kind: String,
        #[arg(long)]
        backend: Option<String>,
    },
    LinkPaperless {
        paperless_id: u64,
        #[arg(long)]
        product_id: Option<String>,
        #[arg(long)]
        claim_id: Option<String>,
        #[arg(long, default_value = "other")]
        kind: String,
    },
    Trash {
        id: String,
    },
    Restore {
        id: String,
    },
}

#[derive(Subcommand)]
pub(crate) enum RecordCommand {
    Validate {
        #[arg(long)]
        file: PathBuf,
    },
    Create {
        #[arg(long)]
        file: PathBuf,
    },
}

#[derive(Subcommand)]
pub(crate) enum BrokerCommand {
    Serve {
        #[arg(long, default_value_os_t = default_socket())]
        listen: PathBuf,
        #[arg(long)]
        credential_file: Option<PathBuf>,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_structured_warranty_guidance_flags() {
        let cli = Cli::try_parse_from([
            "domino",
            "warranty",
            "add",
            "00000000-0000-0000-0000-000000000001",
            "--submission-method",
            "web",
            "--submission-method",
            "phone",
            "--required-evidence",
            "Proof of purchase",
            "--optional-evidence",
            "Packaging photo",
            "--instruction",
            "Open the support form",
            "--optional-instruction",
            "Call to confirm receipt",
        ])
        .expect("structured guidance flags should parse");

        let Command::Warranty {
            command:
                WarrantyCommand::Add {
                    submission_methods,
                    required_evidence,
                    optional_evidence,
                    instructions,
                    optional_instructions,
                    ..
                },
        } = cli.command
        else {
            panic!("expected warranty add command");
        };
        assert_eq!(submission_methods, ["web", "phone"]);
        assert_eq!(required_evidence, ["Proof of purchase"]);
        assert_eq!(optional_evidence, ["Packaging photo"]);
        assert_eq!(instructions, ["Open the support form"]);
        assert_eq!(optional_instructions, ["Call to confirm receipt"]);
    }

    #[test]
    fn rejects_unknown_submission_methods() {
        let result = Cli::try_parse_from([
            "domino",
            "warranty",
            "add",
            "00000000-0000-0000-0000-000000000001",
            "--submission-method",
            "carrier_pigeon",
        ]);

        assert!(result.is_err());
    }
}
