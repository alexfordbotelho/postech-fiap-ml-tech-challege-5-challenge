variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "prefix" { type = string }
variable "environment" { type = string }
variable "key_vault_id" { type = string }
variable "eventhub_id" {
  description = "Resource ID of the offer-events Event Hub"
  type        = string
}
variable "eventhub_namespace_id" {
  description = "Resource ID of the Event Hub namespace (for role assignment)"
  type        = string
}
variable "adx_consumer_group" {
  description = "Event Hub consumer group reserved for ADX data connection"
  type        = string
}
variable "tags" {
  type    = map(string)
  default = {}
}
