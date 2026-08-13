variable "location" {
  description = "Azure region for all resources"
  type        = string
  default     = "brazilsouth"
}

variable "prefix" {
  description = "Short prefix used in resource names (max 8 chars)"
  type        = string
  default     = "datathon"

  validation {
    condition     = length(var.prefix) <= 8
    error_message = "Prefix must be 8 characters or less."
  }
}

variable "image_tag" {
  description = "Container image tag to deploy to Container Apps"
  type        = string
  default     = "latest"
}

variable "postgres_admin_password" {
  description = "PostgreSQL Flexible Server admin password"
  type        = string
  sensitive   = true
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "langfuse_secret_key" {
  description = "Langfuse secret key for API tracing"
  type        = string
  sensitive   = true
  default     = ""
}

variable "langfuse_public_key" {
  description = "Langfuse public key for API tracing"
  type        = string
  sensitive   = true
  default     = ""
}
