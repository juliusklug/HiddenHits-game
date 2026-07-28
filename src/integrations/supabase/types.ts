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
  public: {
    Tables: {
      cards: {
        Row: {
          album: string | null
          artist: string
          card_number: number
          cover_url: string | null
          created_at: string
          id: string
          is_official: boolean
          preview_url: string | null
          qr_payload: string
          release_year: number | null
          source: string
          spotify_resolved_at: string | null
          spotify_uri: string | null
          title: string
          track_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          album?: string | null
          artist: string
          card_number?: number
          cover_url?: string | null
          created_at?: string
          id?: string
          is_official?: boolean
          preview_url?: string | null
          qr_payload: string
          release_year?: number | null
          source?: string
          spotify_resolved_at?: string | null
          spotify_uri?: string | null
          title: string
          track_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          album?: string | null
          artist?: string
          card_number?: number
          cover_url?: string | null
          created_at?: string
          id?: string
          is_official?: boolean
          preview_url?: string | null
          qr_payload?: string
          release_year?: number | null
          source?: string
          spotify_resolved_at?: string | null
          spotify_uri?: string | null
          title?: string
          track_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deck_cards: {
        Row: {
          card_id: string
          created_at: string
          deck_id: string
          id: string
          position: number
        }
        Insert: {
          card_id: string
          created_at?: string
          deck_id: string
          id?: string
          position?: number
        }
        Update: {
          card_id?: string
          created_at?: string
          deck_id?: string
          id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "deck_cards_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      decks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      game_history: {
        Row: {
          correct_guesses: number
          created_at: string
          decade_breakdown: Json
          game_mode: string
          id: string
          score: number
          songs_played: number
          user_id: string
        }
        Insert: {
          correct_guesses?: number
          created_at?: string
          decade_breakdown?: Json
          game_mode: string
          id?: string
          score?: number
          songs_played?: number
          user_id: string
        }
        Update: {
          correct_guesses?: number
          created_at?: string
          decade_breakdown?: Json
          game_mode?: string
          id?: string
          score?: number
          songs_played?: number
          user_id?: string
        }
        Relationships: []
      }
      online_players: {
        Row: {
          created_at: string
          id: string
          is_host: boolean
          is_ready: boolean
          name: string
          room_id: string
          score: number
          steal_ready: boolean
          steal_tokens: number
          timeline: Json
          turn_order: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_host?: boolean
          is_ready?: boolean
          name: string
          room_id: string
          score?: number
          steal_ready?: boolean
          steal_tokens?: number
          timeline?: Json
          turn_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_host?: boolean
          is_ready?: boolean
          name?: string
          room_id?: string
          score?: number
          steal_ready?: boolean
          steal_tokens?: number
          timeline?: Json
          turn_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "online_players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "online_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      online_rooms: {
        Row: {
          bonus_guess: Json | null
          code: string
          created_at: string
          current_card: Json | null
          current_player_id: string | null
          deck: Json
          deck_id: string | null
          deck_name: string | null
          draw_index: number
          host_user_id: string | null
          id: string
          last_result: Json | null
          pending_placement: Json | null
          phase: string
          status: string
          steal: Json | null
          steal_ends_at: string | null
          target_score: number
          updated_at: string
          winner_player_id: string | null
        }
        Insert: {
          bonus_guess?: Json | null
          code: string
          created_at?: string
          current_card?: Json | null
          current_player_id?: string | null
          deck?: Json
          deck_id?: string | null
          deck_name?: string | null
          draw_index?: number
          host_user_id?: string | null
          id?: string
          last_result?: Json | null
          pending_placement?: Json | null
          phase?: string
          status?: string
          steal?: Json | null
          steal_ends_at?: string | null
          target_score?: number
          updated_at?: string
          winner_player_id?: string | null
        }
        Update: {
          bonus_guess?: Json | null
          code?: string
          created_at?: string
          current_card?: Json | null
          current_player_id?: string | null
          deck?: Json
          deck_id?: string | null
          deck_name?: string | null
          draw_index?: number
          host_user_id?: string | null
          id?: string
          last_result?: Json | null
          pending_placement?: Json | null
          phase?: string
          status?: string
          steal?: Json | null
          steal_ends_at?: string | null
          target_score?: number
          updated_at?: string
          winner_player_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      spotify_connections: {
        Row: {
          access_token_ciphertext: string | null
          connected_at: string
          display_name: string | null
          expires_at: string | null
          product: string | null
          refresh_token_ciphertext: string
          scope: string | null
          spotify_user_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_ciphertext?: string | null
          connected_at?: string
          display_name?: string | null
          expires_at?: string | null
          product?: string | null
          refresh_token_ciphertext: string
          scope?: string | null
          spotify_user_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_ciphertext?: string | null
          connected_at?: string
          display_name?: string | null
          expires_at?: string | null
          product?: string | null
          refresh_token_ciphertext?: string
          scope?: string | null
          spotify_user_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_statistics: {
        Row: {
          accuracy: number
          correct_guesses: number
          favorite_decade: string | null
          games_played: number
          id: string
          songs_played: number
          total_guesses: number
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy?: number
          correct_guesses?: number
          favorite_decade?: string | null
          games_played?: number
          id?: string
          songs_played?: number
          total_guesses?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy?: number
          correct_guesses?: number
          favorite_decade?: string | null
          games_played?: number
          id?: string
          songs_played?: number
          total_guesses?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      join_online_room: {
        Args: { p_code: string; p_name: string }
        Returns: {
          created_at: string
          id: string
          is_host: boolean
          is_ready: boolean
          name: string
          room_id: string
          score: number
          steal_ready: boolean
          steal_tokens: number
          timeline: Json
          turn_order: number
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "online_players"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      online_next_turn: { Args: { p_room_id: string }; Returns: undefined }
      online_place_card: {
        Args: { p_room_id: string; p_slot_index: number }
        Returns: undefined
      }
      online_resolve_steal: { Args: { p_room_id: string }; Returns: undefined }
      online_restart_to_lobby: { Args: { p_room_id: string }; Returns: undefined }
      online_set_ready: {
        Args: { p_player_id: string; p_ready: boolean }
        Returns: undefined
      }
      online_set_steal_ready: {
        Args: { p_player_id: string; p_ready?: boolean }
        Returns: undefined
      }
      online_skip_bonus_guess: { Args: { p_room_id: string }; Returns: undefined }
      online_skip_current_card: { Args: { p_room_id: string }; Returns: undefined }
      online_start_game: { Args: { p_room_id: string }; Returns: undefined }
      online_submit_bonus_guess: {
        Args: {
          p_guessed_artist: string
          p_guessed_title: string
          p_room_id: string
        }
        Returns: Json
      }
      online_submit_steal: {
        Args: { p_room_id: string; p_slot_index: number }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
