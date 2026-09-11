export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin: {
        Row: {
          created_at: string | null
          id: string
          name: string | null
          phone: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer: {
        Row: {
          contact: string | null
          created_at: string | null
          id: string
          identification_number: string
          identification_type: Database["public"]["Enums"]["idetification_type"]
          name: string | null
          phone: string | null
          preferred_store: string | null
          user_id: string | null
        }
        Insert: {
          contact?: string | null
          created_at?: string | null
          id?: string
          identification_number: string
          identification_type: Database["public"]["Enums"]["idetification_type"]
          name?: string | null
          phone?: string | null
          preferred_store?: string | null
          user_id?: string | null
        }
        Update: {
          contact?: string | null
          created_at?: string | null
          id?: string
          identification_number?: string
          identification_type?: Database["public"]["Enums"]["idetification_type"]
          name?: string | null
          phone?: string | null
          preferred_store?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_plan: {
        Row: {
          created_at: string | null
          cutoff_at: string | null
          id: string
          notes: string | null
          operator_id: string | null
          plan_code: string | null
          plan_date: string
          plan_seq: number | null
          service_fee_percentage: number
          status: Database["public"]["Enums"]["distribution_plan_status"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          cutoff_at?: string | null
          id?: string
          notes?: string | null
          operator_id?: string | null
          plan_code?: string | null
          plan_date: string
          plan_seq?: number | null
          service_fee_percentage?: number
          status?: Database["public"]["Enums"]["distribution_plan_status"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          cutoff_at?: string | null
          id?: string
          notes?: string | null
          operator_id?: string | null
          plan_code?: string | null
          plan_date?: string
          plan_seq?: number | null
          service_fee_percentage?: number
          status?: Database["public"]["Enums"]["distribution_plan_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distribution_plan_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operator"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillment: {
        Row: {
          created_at: string | null
          id: string
          purchase_item_id: string
          sale_item_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          purchase_item_id: string
          sale_item_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          purchase_item_id?: string
          sale_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_item"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_review: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          distribution_plan_id: string
          error_message: string | null
          id: string
          invoiced_at: string | null
          invoiced_lines: Json | null
          sale_order_id: string
          siigo_invoice_id: string | null
          siigo_invoice_number: string | null
          siigo_public_url: string | null
          status: Database["public"]["Enums"]["invoice_review_status"]
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          distribution_plan_id: string
          error_message?: string | null
          id?: string
          invoiced_at?: string | null
          invoiced_lines?: Json | null
          sale_order_id: string
          siigo_invoice_id?: string | null
          siigo_invoice_number?: string | null
          siigo_public_url?: string | null
          status?: Database["public"]["Enums"]["invoice_review_status"]
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          distribution_plan_id?: string
          error_message?: string | null
          id?: string
          invoiced_at?: string | null
          invoiced_lines?: Json | null
          sale_order_id?: string
          siigo_invoice_id?: string | null
          siigo_invoice_number?: string | null
          siigo_public_url?: string | null
          status?: Database["public"]["Enums"]["invoice_review_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_review_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_review_distribution_plan_id_fkey"
            columns: ["distribution_plan_id"]
            isOneToOne: false
            referencedRelation: "distribution_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_review_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: true
            referencedRelation: "sale_order"
            referencedColumns: ["id"]
          },
        ]
      }
      offer: {
        Row: {
          available: boolean | null
          created_at: string
          distribution_plan_id: string | null
          id: string
          price: number
          product_id: string
          supplier_id: string
        }
        Insert: {
          available?: boolean | null
          created_at?: string
          distribution_plan_id?: string | null
          id?: string
          price: number
          product_id: string
          supplier_id: string
        }
        Update: {
          available?: boolean | null
          created_at?: string
          distribution_plan_id?: string | null
          id?: string
          price?: number
          product_id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_distribution_plan_id_fkey"
            columns: ["distribution_plan_id"]
            isOneToOne: false
            referencedRelation: "distribution_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_with_active_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier"
            referencedColumns: ["id"]
          },
        ]
      }
      operator: {
        Row: {
          created_at: string | null
          id: string
          name: string | null
          phone: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          main_photo: string | null
          name: string
          reference_price: number | null
          siigo_id: string | null
          unit: Database["public"]["Enums"]["unit_type"]
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          main_photo?: string | null
          name: string
          reference_price?: number | null
          siigo_id?: string | null
          unit: Database["public"]["Enums"]["unit_type"]
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          main_photo?: string | null
          name?: string
          reference_price?: number | null
          siigo_id?: string | null
          unit?: Database["public"]["Enums"]["unit_type"]
        }
        Relationships: []
      }
      product_reference_price_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          distribution_plan_id: string | null
          id: string
          new_reference_price: number | null
          old_reference_price: number | null
          product_id: string
          product_name: string
          product_unit: Database["public"]["Enums"]["unit_type"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          distribution_plan_id?: string | null
          id?: string
          new_reference_price?: number | null
          old_reference_price?: number | null
          product_id: string
          product_name: string
          product_unit: Database["public"]["Enums"]["unit_type"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          distribution_plan_id?: string | null
          id?: string
          new_reference_price?: number | null
          old_reference_price?: number | null
          product_id?: string
          product_name?: string
          product_unit?: Database["public"]["Enums"]["unit_type"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          id: string
          name: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string | null
          id: string
          name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      purchase_item: {
        Row: {
          actual_price: number | null
          created_at: string | null
          id: string
          offer_id: string
          purchase_order_id: string
          quantity: number
          received_quantity: number | null
        }
        Insert: {
          actual_price?: number | null
          created_at?: string | null
          id?: string
          offer_id: string
          purchase_order_id: string
          quantity: number
          received_quantity?: number | null
        }
        Update: {
          actual_price?: number | null
          created_at?: string | null
          id?: string
          offer_id?: string
          purchase_order_id?: string
          quantity?: number
          received_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_item_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_item_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_order"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order: {
        Row: {
          created_at: string | null
          created_by: string
          distribution_plan_id: string
          id: string
          notes: string | null
          purchase_code: string | null
          purchase_seq: number | null
          status: Database["public"]["Enums"]["purchase_order_status"]
          supplier_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          distribution_plan_id: string
          id?: string
          notes?: string | null
          purchase_code?: string | null
          purchase_seq?: number | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          supplier_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          distribution_plan_id?: string
          id?: string
          notes?: string | null
          purchase_code?: string | null
          purchase_seq?: number | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          supplier_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_distribution_plan_id_fkey"
            columns: ["distribution_plan_id"]
            isOneToOne: false
            referencedRelation: "distribution_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_item: {
        Row: {
          created_at: string | null
          delivered_at: string | null
          delivered_by: string | null
          delivered_quantity: number | null
          id: string
          product_id: string
          required_quantity: number
          sale_order_id: string
        }
        Insert: {
          created_at?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivered_quantity?: number | null
          id?: string
          product_id: string
          required_quantity: number
          sale_order_id: string
        }
        Update: {
          created_at?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivered_quantity?: number | null
          id?: string
          product_id?: string
          required_quantity?: number
          sale_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_item_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_item_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_with_active_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_item_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sale_order"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_order: {
        Row: {
          created_at: string | null
          created_by_admin_id: string | null
          created_by_customer_id: string | null
          customer_id: string
          delivery_fee: number | null
          distribution_plan_id: string
          id: string
          notes: string | null
          order_code: string | null
          order_seq: number | null
          service_fee: number | null
          service_fee_percentage: number | null
          status: Database["public"]["Enums"]["sale_order_status"]
        }
        Insert: {
          created_at?: string | null
          created_by_admin_id?: string | null
          created_by_customer_id?: string | null
          customer_id: string
          delivery_fee?: number | null
          distribution_plan_id: string
          id?: string
          notes?: string | null
          order_code?: string | null
          order_seq?: number | null
          service_fee?: number | null
          service_fee_percentage?: number | null
          status?: Database["public"]["Enums"]["sale_order_status"]
        }
        Update: {
          created_at?: string | null
          created_by_admin_id?: string | null
          created_by_customer_id?: string | null
          customer_id?: string
          delivery_fee?: number | null
          distribution_plan_id?: string
          id?: string
          notes?: string | null
          order_code?: string | null
          order_seq?: number | null
          service_fee?: number | null
          service_fee_percentage?: number | null
          status?: Database["public"]["Enums"]["sale_order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "sale_order_created_by_admin_id_fkey"
            columns: ["created_by_admin_id"]
            isOneToOne: false
            referencedRelation: "admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_order_created_by_customer_id_fkey"
            columns: ["created_by_customer_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_order_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_order_distribution_plan_id_fkey"
            columns: ["distribution_plan_id"]
            isOneToOne: false
            referencedRelation: "distribution_plan"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_cart: {
        Row: {
          created_at: string | null
          customer_id: string
          id: string
          product_id: string
          quantity: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          id?: string
          product_id: string
          quantity: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_cart_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_cart_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_cart_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_with_active_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      siigo_daily_change_log: {
        Row: {
          change_date: string
          change_type: string
          current_raw_hash: string | null
          current_snapshot_date: string
          entity_id: string
          entity_type: string
          id: string
          inserted_at: string
          previous_raw_hash: string | null
          previous_snapshot_date: string | null
          summary: Json
          sync_run_id: string | null
        }
        Insert: {
          change_date?: string
          change_type: string
          current_raw_hash?: string | null
          current_snapshot_date: string
          entity_id: string
          entity_type: string
          id?: string
          inserted_at?: string
          previous_raw_hash?: string | null
          previous_snapshot_date?: string | null
          summary?: Json
          sync_run_id?: string | null
        }
        Update: {
          change_date?: string
          change_type?: string
          current_raw_hash?: string | null
          current_snapshot_date?: string
          entity_id?: string
          entity_type?: string
          id?: string
          inserted_at?: string
          previous_raw_hash?: string | null
          previous_snapshot_date?: string | null
          summary?: Json
          sync_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "siigo_daily_change_log_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "siigo_sync_run"
            referencedColumns: ["id"]
          },
        ]
      }
      siigo_daily_customer_balance_snapshot: {
        Row: {
          balance_total: number
          collected_total: number
          customer_branch_office: number
          customer_identification: string
          customer_name: string | null
          id: string
          inserted_at: string
          invoices_count: number
          max_days_overdue: number
          metadata: Json
          oldest_due_date: string | null
          overdue_balance_total: number
          sales_total: number
          siigo_customer_id: string | null
          snapshot_date: string
          supabase_customer_id: string | null
          sync_run_id: string | null
          updated_at: string
        }
        Insert: {
          balance_total?: number
          collected_total?: number
          customer_branch_office?: number
          customer_identification: string
          customer_name?: string | null
          id?: string
          inserted_at?: string
          invoices_count?: number
          max_days_overdue?: number
          metadata?: Json
          oldest_due_date?: string | null
          overdue_balance_total?: number
          sales_total?: number
          siigo_customer_id?: string | null
          snapshot_date: string
          supabase_customer_id?: string | null
          sync_run_id?: string | null
          updated_at?: string
        }
        Update: {
          balance_total?: number
          collected_total?: number
          customer_branch_office?: number
          customer_identification?: string
          customer_name?: string | null
          id?: string
          inserted_at?: string
          invoices_count?: number
          max_days_overdue?: number
          metadata?: Json
          oldest_due_date?: string | null
          overdue_balance_total?: number
          sales_total?: number
          siigo_customer_id?: string | null
          snapshot_date?: string
          supabase_customer_id?: string | null
          sync_run_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "siigo_daily_customer_balance_snapshot_supabase_customer_id_fkey"
            columns: ["supabase_customer_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siigo_daily_customer_balance_snapshot_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "siigo_sync_run"
            referencedColumns: ["id"]
          },
        ]
      }
      siigo_daily_indicator_snapshot: {
        Row: {
          accounts_receivable_total: number
          collections_month_to_date: number
          collections_today: number
          customers_overdue_count: number
          customers_with_balance_count: number
          id: string
          inserted_at: string
          invoices_count: number
          metadata: Json
          overdue_receivable_total: number
          payment_receipts_count: number
          sales_month_to_date: number
          sales_today: number
          snapshot_date: string
          sync_run_id: string | null
          updated_at: string
        }
        Insert: {
          accounts_receivable_total?: number
          collections_month_to_date?: number
          collections_today?: number
          customers_overdue_count?: number
          customers_with_balance_count?: number
          id?: string
          inserted_at?: string
          invoices_count?: number
          metadata?: Json
          overdue_receivable_total?: number
          payment_receipts_count?: number
          sales_month_to_date?: number
          sales_today?: number
          snapshot_date: string
          sync_run_id?: string | null
          updated_at?: string
        }
        Update: {
          accounts_receivable_total?: number
          collections_month_to_date?: number
          collections_today?: number
          customers_overdue_count?: number
          customers_with_balance_count?: number
          id?: string
          inserted_at?: string
          invoices_count?: number
          metadata?: Json
          overdue_receivable_total?: number
          payment_receipts_count?: number
          sales_month_to_date?: number
          sales_today?: number
          snapshot_date?: string
          sync_run_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "siigo_daily_indicator_snapshot_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "siigo_sync_run"
            referencedColumns: ["id"]
          },
        ]
      }
      siigo_daily_invoice_item_snapshot: {
        Row: {
          discount_percentage: number | null
          discount_value: number | null
          id: string
          inserted_at: string
          invoice_snapshot_id: string | null
          item_index: number
          line_total: number
          product_code: string | null
          product_description: string | null
          quantity: number
          raw_hash: string
          raw_payload: Json
          siigo_invoice_id: string
          siigo_item_id: string | null
          snapshot_date: string
          sync_run_id: string | null
          taxes: Json
          unit_price: number
          updated_at: string
        }
        Insert: {
          discount_percentage?: number | null
          discount_value?: number | null
          id?: string
          inserted_at?: string
          invoice_snapshot_id?: string | null
          item_index: number
          line_total?: number
          product_code?: string | null
          product_description?: string | null
          quantity?: number
          raw_hash: string
          raw_payload?: Json
          siigo_invoice_id: string
          siigo_item_id?: string | null
          snapshot_date: string
          sync_run_id?: string | null
          taxes?: Json
          unit_price?: number
          updated_at?: string
        }
        Update: {
          discount_percentage?: number | null
          discount_value?: number | null
          id?: string
          inserted_at?: string
          invoice_snapshot_id?: string | null
          item_index?: number
          line_total?: number
          product_code?: string | null
          product_description?: string | null
          quantity?: number
          raw_hash?: string
          raw_payload?: Json
          siigo_invoice_id?: string
          siigo_item_id?: string | null
          snapshot_date?: string
          sync_run_id?: string | null
          taxes?: Json
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "siigo_daily_invoice_item_snapshot_invoice_snapshot_id_fkey"
            columns: ["invoice_snapshot_id"]
            isOneToOne: false
            referencedRelation: "siigo_daily_invoice_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siigo_daily_invoice_item_snapshot_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "siigo_sync_run"
            referencedColumns: ["id"]
          },
        ]
      }
      siigo_daily_invoice_snapshot: {
        Row: {
          balance: number
          customer_branch_office: number | null
          customer_id: string | null
          customer_identification: string | null
          customer_name: string | null
          document_id: string | null
          document_name: string | null
          full_number: string | null
          id: string
          inserted_at: string
          invoice_date: string | null
          invoice_name: string | null
          mail_status: string | null
          number: string | null
          observations: string | null
          paid_value: number | null
          prefix: string | null
          public_url: string | null
          raw_hash: string
          raw_payload: Json
          seller_id: string | null
          siigo_created_at: string | null
          siigo_invoice_id: string
          siigo_updated_at: string | null
          snapshot_date: string
          stamp_status: string | null
          sync_run_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          balance?: number
          customer_branch_office?: number | null
          customer_id?: string | null
          customer_identification?: string | null
          customer_name?: string | null
          document_id?: string | null
          document_name?: string | null
          full_number?: string | null
          id?: string
          inserted_at?: string
          invoice_date?: string | null
          invoice_name?: string | null
          mail_status?: string | null
          number?: string | null
          observations?: string | null
          paid_value?: number | null
          prefix?: string | null
          public_url?: string | null
          raw_hash: string
          raw_payload?: Json
          seller_id?: string | null
          siigo_created_at?: string | null
          siigo_invoice_id: string
          siigo_updated_at?: string | null
          snapshot_date: string
          stamp_status?: string | null
          sync_run_id?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          customer_branch_office?: number | null
          customer_id?: string | null
          customer_identification?: string | null
          customer_name?: string | null
          document_id?: string | null
          document_name?: string | null
          full_number?: string | null
          id?: string
          inserted_at?: string
          invoice_date?: string | null
          invoice_name?: string | null
          mail_status?: string | null
          number?: string | null
          observations?: string | null
          paid_value?: number | null
          prefix?: string | null
          public_url?: string | null
          raw_hash?: string
          raw_payload?: Json
          seller_id?: string | null
          siigo_created_at?: string | null
          siigo_invoice_id?: string
          siigo_updated_at?: string | null
          snapshot_date?: string
          stamp_status?: string | null
          sync_run_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "siigo_daily_invoice_snapshot_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "siigo_sync_run"
            referencedColumns: ["id"]
          },
        ]
      }
      siigo_daily_payment_receipt_item_snapshot: {
        Row: {
          due_consecutive: string | null
          due_date: string | null
          due_prefix: string | null
          due_quote: string | null
          id: string
          inserted_at: string
          item_index: number
          payment_receipt_snapshot_id: string | null
          raw_hash: string
          raw_payload: Json
          siigo_payment_receipt_id: string
          snapshot_date: string
          sync_run_id: string | null
          updated_at: string
          value: number
        }
        Insert: {
          due_consecutive?: string | null
          due_date?: string | null
          due_prefix?: string | null
          due_quote?: string | null
          id?: string
          inserted_at?: string
          item_index: number
          payment_receipt_snapshot_id?: string | null
          raw_hash: string
          raw_payload?: Json
          siigo_payment_receipt_id: string
          snapshot_date: string
          sync_run_id?: string | null
          updated_at?: string
          value?: number
        }
        Update: {
          due_consecutive?: string | null
          due_date?: string | null
          due_prefix?: string | null
          due_quote?: string | null
          id?: string
          inserted_at?: string
          item_index?: number
          payment_receipt_snapshot_id?: string | null
          raw_hash?: string
          raw_payload?: Json
          siigo_payment_receipt_id?: string
          snapshot_date?: string
          sync_run_id?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "siigo_daily_payment_receipt_it_payment_receipt_snapshot_id_fkey"
            columns: ["payment_receipt_snapshot_id"]
            isOneToOne: false
            referencedRelation: "siigo_daily_payment_receipt_snapshot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siigo_daily_payment_receipt_item_snapshot_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "siigo_sync_run"
            referencedColumns: ["id"]
          },
        ]
      }
      siigo_daily_payment_receipt_snapshot: {
        Row: {
          document_id: string | null
          document_name: string | null
          id: string
          inserted_at: string
          number: string | null
          payment_id: string | null
          payment_name: string | null
          payment_value: number
          raw_hash: string
          raw_payload: Json
          receipt_date: string | null
          receipt_name: string | null
          receipt_type: string | null
          siigo_created_at: string | null
          siigo_payment_receipt_id: string
          siigo_updated_at: string | null
          snapshot_date: string
          sync_run_id: string | null
          third_party_branch_office: number | null
          third_party_id: string | null
          third_party_identification: string | null
          third_party_name: string | null
          updated_at: string
        }
        Insert: {
          document_id?: string | null
          document_name?: string | null
          id?: string
          inserted_at?: string
          number?: string | null
          payment_id?: string | null
          payment_name?: string | null
          payment_value?: number
          raw_hash: string
          raw_payload?: Json
          receipt_date?: string | null
          receipt_name?: string | null
          receipt_type?: string | null
          siigo_created_at?: string | null
          siigo_payment_receipt_id: string
          siigo_updated_at?: string | null
          snapshot_date: string
          sync_run_id?: string | null
          third_party_branch_office?: number | null
          third_party_id?: string | null
          third_party_identification?: string | null
          third_party_name?: string | null
          updated_at?: string
        }
        Update: {
          document_id?: string | null
          document_name?: string | null
          id?: string
          inserted_at?: string
          number?: string | null
          payment_id?: string | null
          payment_name?: string | null
          payment_value?: number
          raw_hash?: string
          raw_payload?: Json
          receipt_date?: string | null
          receipt_name?: string | null
          receipt_type?: string | null
          siigo_created_at?: string | null
          siigo_payment_receipt_id?: string
          siigo_updated_at?: string | null
          snapshot_date?: string
          sync_run_id?: string | null
          third_party_branch_office?: number | null
          third_party_id?: string | null
          third_party_identification?: string | null
          third_party_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "siigo_daily_payment_receipt_snapshot_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "siigo_sync_run"
            referencedColumns: ["id"]
          },
        ]
      }
      siigo_sync_run: {
        Row: {
          changes_count: number
          completed_at: string | null
          created_at: string
          customers_count: number
          error_message: string | null
          id: string
          invoice_items_count: number
          invoices_count: number
          metadata: Json
          payment_receipt_items_count: number
          payment_receipts_count: number
          run_type: string
          source: string
          started_at: string
          status: string
          sync_date: string
          updated_at: string
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          changes_count?: number
          completed_at?: string | null
          created_at?: string
          customers_count?: number
          error_message?: string | null
          id?: string
          invoice_items_count?: number
          invoices_count?: number
          metadata?: Json
          payment_receipt_items_count?: number
          payment_receipts_count?: number
          run_type?: string
          source?: string
          started_at?: string
          status?: string
          sync_date?: string
          updated_at?: string
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          changes_count?: number
          completed_at?: string | null
          created_at?: string
          customers_count?: number
          error_message?: string | null
          id?: string
          invoice_items_count?: number
          invoices_count?: number
          metadata?: Json
          payment_receipt_items_count?: number
          payment_receipts_count?: number
          run_type?: string
          source?: string
          started_at?: string
          status?: string
          sync_date?: string
          updated_at?: string
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      supplier: {
        Row: {
          bank_accounts: Json
          contact: string | null
          created_at: string | null
          id: string
          name: string | null
          phone: string | null
          user_id: string
        }
        Insert: {
          bank_accounts?: Json
          contact?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          user_id: string
        }
        Update: {
          bank_accounts?: Json
          contact?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      product_with_active_offers: {
        Row: {
          description: string | null
          id: string | null
          main_photo: string | null
          name: string | null
          offers: Json | null
          reference_price: number | null
          siigo_id: string | null
          unit: Database["public"]["Enums"]["unit_type"] | null
        }
        Relationships: []
      }
      siigo_latest_customer_balances: {
        Row: {
          balance_total: number | null
          collected_total: number | null
          customer_branch_office: number | null
          customer_identification: string | null
          customer_name: string | null
          invoices_count: number | null
          max_days_overdue: number | null
          oldest_due_date: string | null
          overdue_balance_total: number | null
          sales_total: number | null
          snapshot_date: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      siigo_latest_daily_indicators: {
        Row: {
          accounts_receivable_total: number | null
          collections_month_to_date: number | null
          collections_today: number | null
          customers_overdue_count: number | null
          customers_with_balance_count: number | null
          invoices_count: number | null
          overdue_receivable_total: number | null
          payment_receipts_count: number | null
          sales_month_to_date: number | null
          sales_today: number | null
          snapshot_date: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      siigo_latest_open_invoices_summary: {
        Row: {
          balance: number | null
          customer_name: string | null
          full_number: string | null
          invoice_date: string | null
          mail_status: string | null
          paid_value: number | null
          snapshot_date: string | null
          stamp_status: string | null
          total: number | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_in_progress_operations: {
        Args: never
        Returns: {
          customer_name: string
          order_code: string
          order_id: string
          order_quantity: number
          order_status: Database["public"]["Enums"]["sale_order_status"]
          plan_code: string
          plan_date: string
          plan_id: string
          plan_status: Database["public"]["Enums"]["distribution_plan_status"]
          product_image: string
          product_name: string
          product_unit: Database["public"]["Enums"]["unit_type"]
        }[]
      }
      get_invoice_values_by_plan: {
        Args: { p_plan_code: string }
        Returns: {
          customer_id: string
          customer_name: string
          identification_number: string
          identification_type: Database["public"]["Enums"]["idetification_type"]
          line_total: number
          order_code: string
          order_id: string
          order_quantity: number
          plan_code: string
          plan_date: string
          product_id: string
          product_name: string
          product_unit: Database["public"]["Enums"]["unit_type"]
          purchase_unit_price: number
          service_fee_percentage: number
          siigo_id: string
          unit_price: number
        }[]
      }
      get_invoicing_distribution_plan_code: { Args: never; Returns: string }
      get_latest_unfinished_distribution_plan: {
        Args: never
        Returns: {
          created_at: string
          cutoff_at: string
          id: string
          notes: string
          operator_id: string
          plan_code: string
          plan_date: string
          plan_seq: number
          service_fee_percentage: number
          status: Database["public"]["Enums"]["distribution_plan_status"]
          updated_at: string
        }[]
      }
      get_open_plan_siigo_invoice_lines: {
        Args: never
        Returns: {
          identification_number: string
          name: string
          order_code: string
          order_quantity: number
          plan_code: string
          siigo_id: string
          unit_price: number
        }[]
      }
      get_siigo_customer_balances: {
        Args: { p_date?: string; p_limit?: number }
        Returns: {
          balance_total: number
          collected_total: number
          customer_identification: string
          customer_name: string
          invoices_count: number
          max_days_overdue: number
          oldest_due_date: string
          overdue_balance_total: number
          sales_total: number
          snapshot_date: string
        }[]
      }
      get_siigo_daily_indicators: {
        Args: { p_date?: string }
        Returns: {
          accounts_receivable_total: number
          collections_today: number
          customers_overdue_count: number
          customers_with_balance_count: number
          invoices_count: number
          last_sync_completed_at: string
          last_sync_started_at: string
          last_sync_status: string
          overdue_receivable_total: number
          payment_receipts_count: number
          sales_today: number
          snapshot_date: string
        }[]
      }
      get_siigo_overdue_customers: {
        Args: { p_date?: string; p_limit?: number }
        Returns: {
          balance_total: number
          customer_identification: string
          customer_name: string
          max_days_overdue: number
          oldest_due_date: string
          overdue_balance_total: number
          snapshot_date: string
        }[]
      }
      get_siigo_sales_collections_summary: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: {
          collections_total: number
          days_count: number
          end_date: string
          invoices_count: number
          latest_accounts_receivable_total: number
          latest_overdue_receivable_total: number
          latest_snapshot_date: string
          net_receivable_change: number
          payment_receipts_count: number
          sales_total: number
          start_date: string
        }[]
      }
      initialize_invoice_review: {
        Args: { plan_id: string }
        Returns: undefined
      }
      simulate_transition_to_completed_state: {
        Args: { plan_id: string }
        Returns: Json
      }
      transition_to_completed_state: {
        Args: { plan_id: string }
        Returns: undefined
      }
    }
    Enums: {
      distribution_plan_status:
        | "planned"
        | "preparing"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "invoicing"
      idetification_type: "CC" | "NIT" | "PPT" | "PEP"
      invoice_review_status:
        | "pending_review"
        | "approved"
        | "invoicing"
        | "invoiced"
        | "failed"
      purchase_order_status:
        | "created"
        | "published"
        | "accepted"
        | "received"
        | "cancelled"
        | "rejected"
      sale_order_status:
        | "pending"
        | "processing"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
      unit_type: "lb" | "kg" | "atado" | "unidad"
      user_role: "admin" | "operator" | "supplier" | "customer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      distribution_plan_status: [
        "planned",
        "preparing",
        "in_progress",
        "completed",
        "cancelled",
        "invoicing",
      ],
      idetification_type: ["CC", "NIT", "PPT", "PEP"],
      invoice_review_status: [
        "pending_review",
        "approved",
        "invoicing",
        "invoiced",
        "failed",
      ],
      purchase_order_status: [
        "created",
        "published",
        "accepted",
        "received",
        "cancelled",
        "rejected",
      ],
      sale_order_status: [
        "pending",
        "processing",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      unit_type: ["lb", "kg", "atado", "unidad"],
      user_role: ["admin", "operator", "supplier", "customer"],
    },
  },
} as const
