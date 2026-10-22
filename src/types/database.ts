
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "app_settings": {
                  Row: {
                    "id": number,"min_token_balance": number,"timezone": string,"updated_at": string,"urgent_days": number,"warning_days": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: number,"min_token_balance"?: number,"timezone"?: string,"updated_at"?: string,"urgent_days"?: number,"warning_days"?: number
                  }
                  Update: {
                    "id"?: number,"min_token_balance"?: number,"timezone"?: string,"updated_at"?: string,"urgent_days"?: number,"warning_days"?: number
                  }
                  Relationships: [
                    
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"entity": string,"entity_id": string | null,"id": string,"payload": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"entity": string,"entity_id"?: string | null,"id"?: string,"payload"?: NonNullable<Json>
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"entity"?: string,"entity_id"?: string | null,"id"?: string,"payload"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"contact_logs": {
                  Row: {
                    "account_id": string | null,"created_at": string,"created_by": string | null,"customer_id": string,"event_type": Database["public"]['Enums']["contact_event_type"],"followup_status_after": Database["public"]['Enums']["followup_status"] | null,"id": string,"notes": string | null,"rendered_body": string | null,"template_key": string | null,"wa_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id": string,"event_type": Database["public"]['Enums']["contact_event_type"],"followup_status_after"?: Database["public"]['Enums']["followup_status"] | null,"id"?: string,"notes"?: string | null,"rendered_body"?: string | null,"template_key"?: string | null,"wa_url"?: string | null
                  }
                  Update: {
                    "account_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string,"event_type"?: Database["public"]['Enums']["contact_event_type"],"followup_status_after"?: Database["public"]['Enums']["followup_status"] | null,"id"?: string,"notes"?: string | null,"rendered_body"?: string | null,"template_key"?: string | null,"wa_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "contact_logs_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "iptv_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_logs_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "v_account_status"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_logs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_logs_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"first_name": string,"id": string,"last_name": string,"notes": string | null,"phone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"first_name": string,"id"?: string,"last_name": string,"notes"?: string | null,"phone": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"first_name"?: string,"id"?: string,"last_name"?: string,"notes"?: string | null,"phone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"expenses": {
                  Row: {
                    "amount": number,"category": Database["public"]['Enums']["expense_category"],"created_at": string,"created_by": string | null,"description": string,"id": string,"reference": string | null,"spent_at": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"category": Database["public"]['Enums']["expense_category"],"created_at"?: string,"created_by"?: string | null,"description": string,"id"?: string,"reference"?: string | null,"spent_at": string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"category"?: Database["public"]['Enums']["expense_category"],"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: string,"reference"?: string | null,"spent_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"iptv_accounts": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string | null,"customer_id": string,"expires_at": string,"external_username": string,"id": string,"initial_expires_at": string,"last_verified_at": string | null,"notes": string | null,"purchased_at": string,"reference": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id": string,"expires_at": string,"external_username": string,"id"?: string,"initial_expires_at": string,"last_verified_at"?: string | null,"notes"?: string | null,"purchased_at": string,"reference"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string,"expires_at"?: string,"external_username"?: string,"id"?: string,"initial_expires_at"?: string,"last_verified_at"?: string | null,"notes"?: string | null,"purchased_at"?: string,"reference"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "iptv_accounts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "iptv_accounts_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"created_at": string,"created_by": string | null,"id": string,"idempotency_key": string,"method": Database["public"]['Enums']["payment_method"],"notes": string | null,"paid_at": string,"reference": string | null,"renewal_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key": string,"method": Database["public"]['Enums']["payment_method"],"notes"?: string | null,"paid_at": string,"reference"?: string | null,"renewal_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string,"method"?: Database["public"]['Enums']["payment_method"],"notes"?: string | null,"paid_at"?: string,"reference"?: string | null,"renewal_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_renewal_id_fkey"
      columns: ["renewal_id"]
isOneToOne: false
      referencedRelation: "renewals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_renewal_id_fkey"
      columns: ["renewal_id"]
isOneToOne: false
      referencedRelation: "v_renewal_summary"
      referencedColumns: ["id"]
    }
                  ]
                },"plans": {
                  Row: {
                    "created_at": string,"devices": number,"duration_months": number,"id": string,"is_active": boolean,"key": string,"name": string,"sort_order": number,"suggested_price": number,"tokens_required": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"devices": number,"duration_months": number,"id"?: string,"is_active"?: boolean,"key": string,"name": string,"sort_order"?: number,"suggested_price": number,"tokens_required": number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"devices"?: number,"duration_months"?: number,"id"?: string,"is_active"?: boolean,"key"?: string,"name"?: string,"sort_order"?: number,"suggested_price"?: number,"tokens_required"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"renewal_followups": {
                  Row: {
                    "account_id": string,"created_at": string,"id": string,"last_contact_at": string | null,"next_followup_at": string | null,"notes": string | null,"status": Database["public"]['Enums']["followup_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"created_at"?: string,"id"?: string,"last_contact_at"?: string | null,"next_followup_at"?: string | null,"notes"?: string | null,"status"?: Database["public"]['Enums']["followup_status"],"updated_at"?: string
                  }
                  Update: {
                    "account_id"?: string,"created_at"?: string,"id"?: string,"last_contact_at"?: string | null,"next_followup_at"?: string | null,"notes"?: string | null,"status"?: Database["public"]['Enums']["followup_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "renewal_followups_account_id_fkey"
      columns: ["account_id"]
isOneToOne: true
      referencedRelation: "iptv_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "renewal_followups_account_id_fkey"
      columns: ["account_id"]
isOneToOne: true
      referencedRelation: "v_account_status"
      referencedColumns: ["id"]
    }
                  ]
                },"renewals": {
                  Row: {
                    "account_id": string,"amount_agreed": number,"created_at": string,"created_by": string | null,"devices": number,"duration_months": number,"effective_at": string,"expiration_edited": boolean,"id": string,"idempotency_key": string,"new_expiration": string,"notes": string | null,"operation_type": Database["public"]['Enums']["renewal_operation_type"],"plan_id": string,"plan_name": string,"previous_expiration": string | null,"price_snapshot": number,"recorded_at": string,"reversal_reason": string | null,"reversed_at": string | null,"reversed_by": string | null,"tokens_used": number
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"amount_agreed": number,"created_at"?: string,"created_by"?: string | null,"devices": number,"duration_months": number,"effective_at": string,"expiration_edited"?: boolean,"id"?: string,"idempotency_key": string,"new_expiration": string,"notes"?: string | null,"operation_type": Database["public"]['Enums']["renewal_operation_type"],"plan_id": string,"plan_name": string,"previous_expiration"?: string | null,"price_snapshot": number,"recorded_at"?: string,"reversal_reason"?: string | null,"reversed_at"?: string | null,"reversed_by"?: string | null,"tokens_used": number
                  }
                  Update: {
                    "account_id"?: string,"amount_agreed"?: number,"created_at"?: string,"created_by"?: string | null,"devices"?: number,"duration_months"?: number,"effective_at"?: string,"expiration_edited"?: boolean,"id"?: string,"idempotency_key"?: string,"new_expiration"?: string,"notes"?: string | null,"operation_type"?: Database["public"]['Enums']["renewal_operation_type"],"plan_id"?: string,"plan_name"?: string,"previous_expiration"?: string | null,"price_snapshot"?: number,"recorded_at"?: string,"reversal_reason"?: string | null,"reversed_at"?: string | null,"reversed_by"?: string | null,"tokens_used"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "renewals_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "iptv_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "renewals_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "v_account_status"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "renewals_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "renewals_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "renewals_reversed_by_fkey"
      columns: ["reversed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"token_movements": {
                  Row: {
                    "cost_amount": number,"created_at": string,"created_by": string | null,"id": string,"idempotency_key": string,"movement_type": Database["public"]['Enums']["token_movement_type"],"purchase_id": string | null,"quantity_delta": number,"reason": string | null,"renewal_id": string | null,"unit_cost": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_amount": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key": string,"movement_type": Database["public"]['Enums']["token_movement_type"],"purchase_id"?: string | null,"quantity_delta": number,"reason"?: string | null,"renewal_id"?: string | null,"unit_cost": number
                  }
                  Update: {
                    "cost_amount"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string,"movement_type"?: Database["public"]['Enums']["token_movement_type"],"purchase_id"?: string | null,"quantity_delta"?: number,"reason"?: string | null,"renewal_id"?: string | null,"unit_cost"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "token_movements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "token_movements_purchase_id_fkey"
      columns: ["purchase_id"]
isOneToOne: false
      referencedRelation: "token_purchases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "token_movements_renewal_id_fkey"
      columns: ["renewal_id"]
isOneToOne: false
      referencedRelation: "renewals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "token_movements_renewal_id_fkey"
      columns: ["renewal_id"]
isOneToOne: false
      referencedRelation: "v_renewal_summary"
      referencedColumns: ["id"]
    }
                  ]
                },"token_purchases": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"idempotency_key": string,"notes": string | null,"purchased_at": string,"quantity": number,"reference": string | null,"supplier": string | null,"total_cost": number,"unit_cost": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key": string,"notes"?: string | null,"purchased_at": string,"quantity": number,"reference"?: string | null,"supplier"?: string | null,"total_cost": number,"unit_cost"?: never
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string,"notes"?: string | null,"purchased_at"?: string,"quantity"?: number,"reference"?: string | null,"supplier"?: string | null,"total_cost"?: number,"unit_cost"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "token_purchases_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"token_stock": {
                  Row: {
                    "avg_unit_cost": number,"id": number,"quantity": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avg_unit_cost"?: number,"id"?: number,"quantity"?: number,"updated_at"?: string
                  }
                  Update: {
                    "avg_unit_cost"?: number,"id"?: number,"quantity"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"whatsapp_templates": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"is_active": boolean,"key": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"key": string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"key"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "v_account_status": {
                  Row: {
                    "archived_at": string | null,"created_at": string | null,"created_by": string | null,"customer_id": string | null,"customer_name": string | null,"days_left": number | null,"expires_at": string | null,"expires_on": string | null,"external_username": string | null,"followup_status": Database["public"]['Enums']["followup_status"] | null,"id": string | null,"initial_expires_at": string | null,"is_stale_verification": boolean | null,"last_verified_at": string | null,"notes": string | null,"phone": string | null,"purchased_at": string | null,"reference": string | null,"status": string | null,"status_rank": number | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "iptv_accounts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "iptv_accounts_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    }
                  ]
                },"v_cash_movements": {
                  Row: {
                    "amount": number | null,"description": string | null,"direction": string | null,"kind": string | null,"occurred_at": string | null,"reference": string | null,"source_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"v_renewal_summary": {
                  Row: {
                    "account_id": string | null,"amount_agreed": number | null,"amount_paid": number | null,"amount_pending": number | null,"created_at": string | null,"created_by": string | null,"devices": number | null,"duration_months": number | null,"effective_at": string | null,"expiration_edited": boolean | null,"gross_margin": number | null,"id": string | null,"idempotency_key": string | null,"is_reversed": boolean | null,"new_expiration": string | null,"notes": string | null,"operation_type": Database["public"]['Enums']["renewal_operation_type"] | null,"plan_id": string | null,"plan_name": string | null,"previous_expiration": string | null,"price_snapshot": number | null,"recorded_at": string | null,"reversal_reason": string | null,"reversed_at": string | null,"reversed_by": string | null,"token_cost": number | null,"tokens_used": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "renewals_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "iptv_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "renewals_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "v_account_status"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "renewals_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "renewals_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "renewals_reversed_by_fkey"
      columns: ["reversed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "account_status":
{ Args: { "p_archived_at": string,"p_at"?: string,"p_expires_at": string }; Returns: string
                           },
"add_months":
{ Args: { "p_months": number,"p_ts": string }; Returns: string
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"rpc_adjust_tokens":
{ Args: { "p_delta": number,"p_idempotency_key": string,"p_reason": string }; Returns: {
              "cost_amount": number,
"created_at": string,
"created_by": string | null,
"id": string,
"idempotency_key": string,
"movement_type": Database["public"]['Enums']["token_movement_type"],
"purchase_id": string | null,
"quantity_delta": number,
"reason": string | null,
"renewal_id": string | null,
"unit_cost": number
            }
                          SetofOptions: {
        from: "*"
        to: "token_movements"
        isOneToOne: true
        isSetofReturn: false
      } },
"rpc_purchase_tokens":
{ Args: { "p_idempotency_key": string,"p_notes": string,"p_purchased_at": string,"p_quantity": number,"p_reference": string,"p_supplier": string,"p_total_cost": number }; Returns: {
              "created_at": string,
"created_by": string | null,
"id": string,
"idempotency_key": string,
"notes": string | null,
"purchased_at": string,
"quantity": number,
"reference": string | null,
"supplier": string | null,
"total_cost": number,
"unit_cost": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "token_purchases"
        isOneToOne: true
        isSetofReturn: false
      } },
"rpc_record_payment":
{ Args: { "p_amount": number,"p_idempotency_key": string,"p_method": Database["public"]['Enums']["payment_method"],"p_notes": string,"p_paid_at": string,"p_reference": string,"p_renewal_id": string }; Returns: {
              "amount": number,
"created_at": string,
"created_by": string | null,
"id": string,
"idempotency_key": string,
"method": Database["public"]['Enums']["payment_method"],
"notes": string | null,
"paid_at": string,
"reference": string | null,
"renewal_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"rpc_register_renewal":
{ Args: { "p_account_id": string,"p_amount_agreed": number,"p_effective_at": string,"p_expiration_edited"?: boolean,"p_idempotency_key": string,"p_new_expiration": string,"p_notes": string,"p_operation_type": Database["public"]['Enums']["renewal_operation_type"],"p_plan_id": string,"p_tokens_used": number }; Returns: {
              "account_id": string,
"amount_agreed": number,
"created_at": string,
"created_by": string | null,
"devices": number,
"duration_months": number,
"effective_at": string,
"expiration_edited": boolean,
"id": string,
"idempotency_key": string,
"new_expiration": string,
"notes": string | null,
"operation_type": Database["public"]['Enums']["renewal_operation_type"],
"plan_id": string,
"plan_name": string,
"previous_expiration": string | null,
"price_snapshot": number,
"recorded_at": string,
"reversal_reason": string | null,
"reversed_at": string | null,
"reversed_by": string | null,
"tokens_used": number
            }
                          SetofOptions: {
        from: "*"
        to: "renewals"
        isOneToOne: true
        isSetofReturn: false
      } },
"rpc_reverse_renewal":
{ Args: { "p_idempotency_key"?: string,"p_reason": string,"p_renewal_id": string }; Returns: {
              "account_id": string,
"amount_agreed": number,
"created_at": string,
"created_by": string | null,
"devices": number,
"duration_months": number,
"effective_at": string,
"expiration_edited": boolean,
"id": string,
"idempotency_key": string,
"new_expiration": string,
"notes": string | null,
"operation_type": Database["public"]['Enums']["renewal_operation_type"],
"plan_id": string,
"plan_name": string,
"previous_expiration": string | null,
"price_snapshot": number,
"recorded_at": string,
"reversal_reason": string | null,
"reversed_at": string | null,
"reversed_by": string | null,
"tokens_used": number
            }
                          SetofOptions: {
        from: "*"
        to: "renewals"
        isOneToOne: true
        isSetofReturn: false
      } },
"rpc_set_account_expiration":
{ Args: { "p_account_id": string,"p_expires_at": string,"p_idempotency_key"?: string,"p_reason": string }; Returns: {
              "archived_at": string | null,
"created_at": string,
"created_by": string | null,
"customer_id": string,
"expires_at": string,
"external_username": string,
"id": string,
"initial_expires_at": string,
"last_verified_at": string | null,
"notes": string | null,
"purchased_at": string,
"reference": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "iptv_accounts"
        isOneToOne: true
        isSetofReturn: false
      } },
"rpc_update_followup":
{ Args: { "p_account_id": string,"p_event_type"?: Database["public"]['Enums']["contact_event_type"],"p_idempotency_key"?: string,"p_next_followup_at"?: string,"p_notes"?: string,"p_rendered_body"?: string,"p_status"?: Database["public"]['Enums']["followup_status"],"p_template_key"?: string,"p_wa_url"?: string }; Returns: {
              "account_id": string,
"created_at": string,
"id": string,
"last_contact_at": string | null,
"next_followup_at": string | null,
"notes": string | null,
"status": Database["public"]['Enums']["followup_status"],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "renewal_followups"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "contact_event_type": "ENLACE_ABIERTO"|"MENSAJE_ENVIADO"|"RESPUESTA_RECIBIDA","expense_category": "OPERATIVO"|"PUBLICIDAD"|"HERRAMIENTAS"|"OTRO","followup_status": "PENDIENTE"|"CONTACTADO"|"EN_CONVERSACION"|"CONFIRMADO"|"RENOVADO"|"NO_RENOVARA","payment_method": "YAPE"|"PLIN"|"TRANSFERENCIA"|"EFECTIVO"|"OTRO","renewal_operation_type": "ACTIVACION"|"RENOVACION","token_movement_type": "COMPRA"|"CONSUMO"|"AJUSTE"|"REVERSION"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "contact_event_type": ["ENLACE_ABIERTO", "MENSAJE_ENVIADO", "RESPUESTA_RECIBIDA"],"expense_category": ["OPERATIVO", "PUBLICIDAD", "HERRAMIENTAS", "OTRO"],"followup_status": ["PENDIENTE", "CONTACTADO", "EN_CONVERSACION", "CONFIRMADO", "RENOVADO", "NO_RENOVARA"],"payment_method": ["YAPE", "PLIN", "TRANSFERENCIA", "EFECTIVO", "OTRO"],"renewal_operation_type": ["ACTIVACION", "RENOVACION"],"token_movement_type": ["COMPRA", "CONSUMO", "AJUSTE", "REVERSION"]
          }
        }
} as const
