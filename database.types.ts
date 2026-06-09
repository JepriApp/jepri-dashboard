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
    PostgrestVersion: "13.0.5"
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
          identification_type:
            | Database["public"]["Enums"]["idetification_type"]
            | null
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
          identification_type?:
            | Database["public"]["Enums"]["idetification_type"]
            | null
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
          identification_type?:
            | Database["public"]["Enums"]["idetification_type"]
            | null
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
          created_at: string
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
          created_at?: string
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
          created_at?: string
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
      supplier: {
        Row: {
          bank_accounts: Json | null
          contact: string | null
          created_at: string | null
          id: string
          name: string | null
          phone: string | null
          user_id: string | null
        }
        Insert: {
          bank_accounts?: Json | null
          contact?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          bank_accounts?: Json | null
          contact?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          user_id?: string | null
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
    }
    Functions: {
      procesar_ofertas_por_plan: {
        Args: { plan_id: string }
        Returns: undefined
      }
      simular_procesamiento_plan: { Args: { plan_id: string }; Returns: Json }
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
      unit_type: "lb" | "kg" | "unidad" | "atado"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
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
      unit_type: ["lb", "kg", "unidad", "atado"],
      user_role: ["admin", "operator", "supplier", "customer"],
    },
  },
} as const
