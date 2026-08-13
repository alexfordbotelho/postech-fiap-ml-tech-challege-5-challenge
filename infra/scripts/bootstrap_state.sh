#!/usr/bin/env bash
# Bootstrap Azure remote state storage for Terraform.
# Run ONCE before the first `terraform init`. Idempotent — safe to re-run.
#
# Prerequisites:
#   az login (or service principal env vars ARM_CLIENT_ID/ARM_CLIENT_SECRET)
#   az account set --subscription <SUBSCRIPTION_ID>
set -euo pipefail

LOCATION="${1:-brazilsouth}"
RG="rg-terraform-state"
SA="stdatathonstate7mlet"
CONTAINER="tfstate"

echo "==> Bootstrapping Terraform remote state"
echo "    Resource Group : $RG"
echo "    Storage Account: $SA"
echo "    Container      : $CONTAINER"
echo "    Location       : $LOCATION"
echo ""

az group create \
  --name "$RG" \
  --location "$LOCATION" \
  --output none \
  --only-show-errors
echo "✓ Resource group ready"

az storage account create \
  --name "$SA" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --min-tls-version TLS1_2 \
  --allow-blob-public-access false \
  --output none \
  --only-show-errors
echo "✓ Storage account ready"

az storage container create \
  --name "$CONTAINER" \
  --account-name "$SA" \
  --auth-mode login \
  --output none \
  --only-show-errors
echo "✓ Container ready"

echo ""
echo "State backend provisioned. Next steps:"
echo "  cd infra/terraform"
echo "  terraform init"
echo "  terraform apply -var-file=environments/dev.tfvars"
