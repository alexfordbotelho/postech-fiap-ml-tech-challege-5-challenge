terraform {
  required_version = ">= 1.7.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.100"
    }
    azapi = {
      source  = "azure/azapi"
      version = "~> 1.13"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.11"
    }
  }

  backend "azurerm" {
    resource_group_name  = "rg-terraform-state"
    storage_account_name = "stdatathonstate7mlet"
    container_name       = "tfstate"
    key                  = "datathon-7mlet.tfstate"
  }
}

provider "azurerm" {
  features {
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
    key_vault {
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = true
    }
    machine_learning {
      purge_soft_deleted_workspace_on_destroy = true
    }
    cognitive_account {
      purge_soft_delete_on_destroy = true
    }
  }
}

provider "azapi" {}
