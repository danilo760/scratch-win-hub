export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      achievements: {
        Row: {
          active: boolean;
          created_at: string;
          criteria: Json;
          description: string;
          icon: string;
          id: string;
          name: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          criteria?: Json;
          description: string;
          icon: string;
          id?: string;
          name: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          criteria?: Json;
          description?: string;
          icon?: string;
          id?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      admin_audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          metadata: Json;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          metadata?: Json;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          metadata?: Json;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          action: string;
          admin_id: string | null;
          after_data: Json | null;
          before_data: Json | null;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          metadata: Json;
        };
        Insert: {
          action: string;
          admin_id?: string | null;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          metadata?: Json;
        };
        Update: {
          action?: string;
          admin_id?: string | null;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          metadata?: Json;
        };
        Relationships: [];
      };
      credit_ledger: {
        Row: {
          amount: number;
          balance_after: number;
          balance_before: number;
          created_at: string;
          id: string;
          metadata: Json;
          reference_id: string;
          reference_type: string;
          transaction_type: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          balance_after: number;
          balance_before: number;
          created_at?: string;
          id?: string;
          metadata?: Json;
          reference_id: string;
          reference_type: string;
          transaction_type: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          balance_after?: number;
          balance_before?: number;
          created_at?: string;
          id?: string;
          metadata?: Json;
          reference_id?: string;
          reference_type?: string;
          transaction_type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      credit_transactions: {
        Row: {
          amount: number;
          approved_at: string | null;
          created_at: string;
          id: string;
          pix_key: string | null;
          status: string;
          type: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          approved_at?: string | null;
          created_at?: string;
          id?: string;
          pix_key?: string | null;
          status?: string;
          type: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          approved_at?: string | null;
          created_at?: string;
          id?: string;
          pix_key?: string | null;
          status?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      daily_scratch_claims: {
        Row: {
          claim_date: string;
          created_at: string;
          id: string;
          scratch_play_id: string | null;
          user_id: string;
        };
        Insert: {
          claim_date: string;
          created_at?: string;
          id?: string;
          scratch_play_id?: string | null;
          user_id: string;
        };
        Update: {
          claim_date?: string;
          created_at?: string;
          id?: string;
          scratch_play_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_scratch_claims_scratch_play_id_fkey";
            columns: ["scratch_play_id"];
            isOneToOne: false;
            referencedRelation: "plays";
            referencedColumns: ["id"];
          },
        ];
      };
      mystery_openings: {
        Row: {
          client_request_id: string;
          id: string;
          math_version_id: string | null;
          mystery_version_id: string;
          opened_at: string;
          scratchcard_id: string;
          user_id: string;
        };
        Insert: {
          client_request_id: string;
          id?: string;
          math_version_id?: string | null;
          mystery_version_id: string;
          opened_at?: string;
          scratchcard_id: string;
          user_id: string;
        };
        Update: {
          client_request_id?: string;
          id?: string;
          math_version_id?: string | null;
          mystery_version_id?: string;
          opened_at?: string;
          scratchcard_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mystery_openings_math_version_id_fkey";
            columns: ["math_version_id"];
            isOneToOne: false;
            referencedRelation: "scratch_math_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mystery_openings_mystery_version_id_fkey";
            columns: ["mystery_version_id"];
            isOneToOne: false;
            referencedRelation: "mystery_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mystery_openings_scratchcard_id_fkey";
            columns: ["scratchcard_id"];
            isOneToOne: false;
            referencedRelation: "scratchcards";
            referencedColumns: ["id"];
          },
        ];
      };
      mystery_version_entries: {
        Row: {
          id: string;
          mystery_version_id: string;
          scratchcard_id: string;
          weight: number;
        };
        Insert: {
          id?: string;
          mystery_version_id: string;
          scratchcard_id: string;
          weight: number;
        };
        Update: {
          id?: string;
          mystery_version_id?: string;
          scratchcard_id?: string;
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: "mystery_version_entries_mystery_version_id_fkey";
            columns: ["mystery_version_id"];
            isOneToOne: false;
            referencedRelation: "mystery_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mystery_version_entries_scratchcard_id_fkey";
            columns: ["scratchcard_id"];
            isOneToOne: false;
            referencedRelation: "scratchcards";
            referencedColumns: ["id"];
          },
        ];
      };
      mystery_versions: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          published_at: string | null;
          published_by: string | null;
          status: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          published_at?: string | null;
          published_by?: string | null;
          status?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          published_at?: string | null;
          published_by?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      plays: {
        Row: {
          balance_after: number | null;
          card_id: string;
          client_request_id: string | null;
          created_at: string;
          id: string;
          math_version_id: string | null;
          outcome_id: string | null;
          points_after: number | null;
          points_earned: number;
          price: number;
          prize: number;
          source: string;
          user_id: string;
        };
        Insert: {
          balance_after?: number | null;
          card_id: string;
          client_request_id?: string | null;
          created_at?: string;
          id?: string;
          math_version_id?: string | null;
          outcome_id?: string | null;
          points_after?: number | null;
          points_earned: number;
          price: number;
          prize: number;
          source?: string;
          user_id: string;
        };
        Update: {
          balance_after?: number | null;
          card_id?: string;
          client_request_id?: string | null;
          created_at?: string;
          id?: string;
          math_version_id?: string | null;
          outcome_id?: string | null;
          points_after?: number | null;
          points_earned?: number;
          price?: number;
          prize?: number;
          source?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plays_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "scratchcards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plays_math_version_id_fkey";
            columns: ["math_version_id"];
            isOneToOne: false;
            referencedRelation: "scratch_math_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plays_outcome_id_fkey";
            columns: ["outcome_id"];
            isOneToOne: false;
            referencedRelation: "scratch_outcomes";
            referencedColumns: ["id"];
          },
        ];
      };
      points_ledger: {
        Row: {
          amount: number;
          balance_after: number;
          balance_before: number;
          created_at: string;
          id: string;
          metadata: Json;
          reference_id: string;
          reference_type: string;
          transaction_type: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          balance_after: number;
          balance_before: number;
          created_at?: string;
          id?: string;
          metadata?: Json;
          reference_id: string;
          reference_type: string;
          transaction_type: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          balance_after?: number;
          balance_before?: number;
          created_at?: string;
          id?: string;
          metadata?: Json;
          reference_id?: string;
          reference_type?: string;
          transaction_type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          balance: number;
          created_at: string;
          display_name: string;
          email: string | null;
          id: string;
          is_admin: boolean;
          level: number;
          points: number;
          profile_public: boolean;
          public_slug: string;
          show_achievements: boolean;
          show_statistics: boolean;
          updated_at: string;
          xp: number;
        };
        Insert: {
          avatar_url?: string | null;
          balance?: number;
          created_at?: string;
          display_name: string;
          email?: string | null;
          id: string;
          is_admin?: boolean;
          level?: number;
          points?: number;
          profile_public?: boolean;
          public_slug: string;
          show_achievements?: boolean;
          show_statistics?: boolean;
          updated_at?: string;
          xp?: number;
        };
        Update: {
          avatar_url?: string | null;
          balance?: number;
          created_at?: string;
          display_name?: string;
          email?: string | null;
          id?: string;
          is_admin?: boolean;
          level?: number;
          points?: number;
          profile_public?: boolean;
          public_slug?: string;
          show_achievements?: boolean;
          show_statistics?: boolean;
          updated_at?: string;
          xp?: number;
        };
        Relationships: [];
      };
      raffle_tickets: {
        Row: {
          id: string;
          purchased_at: string;
          raffle_id: string;
          ticket_number: number;
          user_id: string;
        };
        Insert: {
          id?: string;
          purchased_at?: string;
          raffle_id: string;
          ticket_number: number;
          user_id: string;
        };
        Update: {
          id?: string;
          purchased_at?: string;
          raffle_id?: string;
          ticket_number?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "raffle_tickets_raffle_id_fkey";
            columns: ["raffle_id"];
            isOneToOne: false;
            referencedRelation: "raffles";
            referencedColumns: ["id"];
          },
        ];
      };
      raffles: {
        Row: {
          closed_at: string | null;
          created_at: string;
          description: string;
          id: string;
          image_url: string | null;
          status: string;
          ticket_price: number;
          title: string;
          total_tickets: number;
          winner_ticket: number | null;
        };
        Insert: {
          closed_at?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          image_url?: string | null;
          status?: string;
          ticket_price: number;
          title: string;
          total_tickets: number;
          winner_ticket?: number | null;
        };
        Update: {
          closed_at?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          image_url?: string | null;
          status?: string;
          ticket_price?: number;
          title?: string;
          total_tickets?: number;
          winner_ticket?: number | null;
        };
        Relationships: [];
      };
      redemptions: {
        Row: {
          client_request_id: string | null;
          created_at: string;
          fulfillment_code: string | null;
          id: string;
          item_id: string;
          item_image_url_snapshot: string | null;
          item_title_snapshot: string;
          points_after: number | null;
          points_spent: number;
          protocol: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          client_request_id?: string | null;
          created_at?: string;
          fulfillment_code?: string | null;
          id?: string;
          item_id: string;
          item_image_url_snapshot?: string | null;
          item_title_snapshot: string;
          points_after?: number | null;
          points_spent: number;
          protocol?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          client_request_id?: string | null;
          created_at?: string;
          fulfillment_code?: string | null;
          id?: string;
          item_id?: string;
          item_image_url_snapshot?: string | null;
          item_title_snapshot?: string;
          points_after?: number | null;
          points_spent?: number;
          protocol?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "redemptions_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "store_items";
            referencedColumns: ["id"];
          },
        ];
      };
      scratch_math_versions: {
        Row: {
          config: Json;
          created_at: string;
          id: string;
          published_at: string | null;
          published_by: string | null;
          rarity_id: string | null;
          scratchcard_id: string;
          status: string;
          version_name: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          id?: string;
          published_at?: string | null;
          published_by?: string | null;
          rarity_id?: string | null;
          scratchcard_id: string;
          status?: string;
          version_name: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          id?: string;
          published_at?: string | null;
          published_by?: string | null;
          rarity_id?: string | null;
          scratchcard_id?: string;
          status?: string;
          version_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scratch_math_versions_rarity_id_fkey";
            columns: ["rarity_id"];
            isOneToOne: false;
            referencedRelation: "scratch_rarities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scratch_math_versions_scratchcard_id_fkey";
            columns: ["scratchcard_id"];
            isOneToOne: false;
            referencedRelation: "scratchcards";
            referencedColumns: ["id"];
          },
        ];
      };
      scratch_outcomes: {
        Row: {
          created_at: string;
          id: string;
          math_version_id: string;
          name: string;
          points: number;
          prize: number;
          weight: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          math_version_id: string;
          name: string;
          points?: number;
          prize: number;
          weight: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          math_version_id?: string;
          name?: string;
          points?: number;
          prize?: number;
          weight?: number;
        };
        Relationships: [
          {
            foreignKeyName: "scratch_outcomes_math_version_id_fkey";
            columns: ["math_version_id"];
            isOneToOne: false;
            referencedRelation: "scratch_math_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      scratch_rarities: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          name: string;
          slug: string;
          theme: Json;
        };
        Insert: {
          created_at?: string;
          description?: string;
          id?: string;
          name: string;
          slug: string;
          theme?: Json;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          name?: string;
          slug?: string;
          theme?: Json;
        };
        Relationships: [];
      };
      scratchcards: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          is_daily_eligible: boolean;
          points_reward: number;
          price: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          is_daily_eligible?: boolean;
          points_reward?: number;
          price?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          is_daily_eligible?: boolean;
          points_reward?: number;
          price?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      store_items: {
        Row: {
          active: boolean;
          category: string | null;
          created_at: string;
          description: string | null;
          display_order: number;
          ends_at: string | null;
          id: string;
          image_url: string | null;
          per_user_limit: number;
          points_cost: number;
          starts_at: string | null;
          stock: number;
          stock_available: number;
          stock_total: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          category?: string | null;
          created_at?: string;
          description?: string | null;
          display_order?: number;
          ends_at?: string | null;
          id?: string;
          image_url?: string | null;
          per_user_limit: number;
          points_cost?: number;
          starts_at?: string | null;
          stock?: number;
          stock_available: number;
          stock_total: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          category?: string | null;
          created_at?: string;
          description?: string | null;
          display_order?: number;
          ends_at?: string | null;
          id?: string;
          image_url?: string | null;
          per_user_limit?: number;
          points_cost?: number;
          starts_at?: string | null;
          stock?: number;
          stock_available?: number;
          stock_total?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_achievements: {
        Row: {
          achievement_id: string;
          earned_at: string;
          id: string;
          metadata: Json;
          user_id: string;
        };
        Insert: {
          achievement_id: string;
          earned_at?: string;
          id?: string;
          metadata?: Json;
          user_id: string;
        };
        Update: {
          achievement_id?: string;
          earned_at?: string;
          id?: string;
          metadata?: Json;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey";
            columns: ["achievement_id"];
            isOneToOne: false;
            referencedRelation: "achievements";
            referencedColumns: ["id"];
          },
        ];
      };
      xp_transactions: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          source_id: string;
          source_type: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          source_id: string;
          source_type: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          source_id?: string;
          source_type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_math_outcome_v1: {
        Args: {
          p_math_version_id: string;
          p_name: string;
          p_points: number;
          p_prize: number;
          p_weight: number;
        };
        Returns: string;
      };
      admin_add_mystery_entry_v1: {
        Args: {
          p_mystery_version_id: string;
          p_scratchcard_id: string;
          p_weight: number;
        };
        Returns: string;
      };
      admin_clear_daily_scratch_v1: { Args: never; Returns: undefined };
      admin_create_mystery_draft_v1: {
        Args: { p_name: string };
        Returns: string;
      };
      admin_delete_mystery_entry_v1: {
        Args: { p_entry_id: string };
        Returns: undefined;
      };
      admin_publish_mystery_v1: {
        Args: { p_mystery_version_id: string };
        Returns: Json;
      };
      admin_set_daily_scratch_v1: {
        Args: { p_card_id: string };
        Returns: undefined;
      };
      admin_update_mystery_entry_v1: {
        Args: { p_entry_id: string; p_weight: number };
        Returns: undefined;
      };
      admin_update_redemption_v1: {
        Args: {
          p_fulfillment_code?: string;
          p_redemption_id: string;
          p_status: string;
        };
        Returns: Json;
      };
      admin_upsert_scratchcard_v1: {
        Args: {
          p_active: boolean;
          p_id?: string;
          p_is_daily_eligible?: boolean;
          p_price: number;
          p_title: string;
        };
        Returns: string;
      };
      admin_upsert_store_item_v1: {
        Args: {
          p_active: boolean;
          p_category?: string;
          p_description?: string;
          p_display_order?: number;
          p_ends_at?: string;
          p_id?: string;
          p_image_url?: string;
          p_per_user_limit: number;
          p_points_cost: number;
          p_starts_at?: string;
          p_stock_available: number;
          p_stock_total: number;
          p_title: string;
        };
        Returns: string;
      };
      award_achievement: {
        Args: { p_metadata?: Json; p_slug: string; p_user_id: string };
        Returns: undefined;
      };
      buy_raffle_tickets: {
        Args: { p_quantity: number; p_raffle_id: string };
        Returns: Json;
      };
      claim_daily_scratch_v1: {
        Args: { p_card_id: string; p_client_request_id: string };
        Returns: Json;
      };
      claim_daily_scratch_v2: {
        Args: { p_client_request_id: string };
        Returns: Json;
      };
      create_math_draft_v1: {
        Args: {
          p_card_id: string;
          p_rarity_slug: string;
          p_version_name: string;
        };
        Returns: string;
      };
      delete_math_outcome_v1: {
        Args: { p_outcome_id: string };
        Returns: undefined;
      };
      get_active_scratchcards_v1: {
        Args: never;
        Returns: {
          id: string;
          math_version_id: string;
          price: number;
          rarity_name: string;
          rarity_slug: string;
          rarity_theme: Json;
          title: string;
        }[];
      };
      get_admin_dashboard_v1: { Args: never; Returns: Json };
      get_admin_math_config_v1: { Args: never; Returns: Json };
      get_admin_operations_v1: { Args: never; Returns: Json };
      get_math_audit_v1: { Args: { p_math_version_id: string }; Returns: Json };
      get_public_profile: { Args: { p_slug: string }; Returns: Json };
      get_special_scratch_status_v1: { Args: never; Returns: Json };
      is_admin: { Args: { _user_id: string }; Returns: boolean };
      open_mystery_scratch_v1: {
        Args: { p_client_request_id: string };
        Returns: Json;
      };
      play_scratchcard: { Args: { card_id: string }; Returns: Json };
      play_scratchcard_v1: {
        Args: {
          p_card_id: string;
          p_client_request_id: string;
          p_source?: string;
        };
        Returns: Json;
      };
      publish_math_version_v1: {
        Args: { p_math_version_id: string };
        Returns: Json;
      };
      redeem_item: { Args: { item_id_param: string }; Returns: Json };
      redeem_reward_v1: {
        Args: { p_client_request_id: string; p_item_id: string };
        Returns: Json;
      };
      simulate_math_v1: {
        Args: { p_math_version_id: string; p_simulations: number };
        Returns: Json;
      };
      update_math_outcome_v1: {
        Args: {
          p_name: string;
          p_outcome_id: string;
          p_points: number;
          p_prize: number;
          p_weight: number;
        };
        Returns: undefined;
      };
      update_profile_preferences: {
        Args: {
          p_avatar_url: string;
          p_display_name: string;
          p_profile_public: boolean;
          p_public_slug: string;
          p_show_achievements: boolean;
          p_show_statistics: boolean;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
