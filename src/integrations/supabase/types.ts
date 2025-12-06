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
      ai_course_jobs: {
        Row: {
          completed_at: string | null
          course_id: string
          created_at: string
          created_by: string | null
          error: string | null
          generation_duration_ms: number | null
          grade: string | null
          grade_band: string
          id: string
          idempotency_key: string | null
          items_per_group: number
          last_heartbeat: string | null
          max_retries: number
          mode: string
          processing_duration_ms: number | null
          progress_message: string | null
          progress_percent: number | null
          progress_stage: string | null
          result_path: string | null
          retry_count: number
          started_at: string | null
          status: string
          subject: string
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          generation_duration_ms?: number | null
          grade?: string | null
          grade_band: string
          id?: string
          idempotency_key?: string | null
          items_per_group?: number
          last_heartbeat?: string | null
          max_retries?: number
          mode: string
          processing_duration_ms?: number | null
          progress_message?: string | null
          progress_percent?: number | null
          progress_stage?: string | null
          result_path?: string | null
          retry_count?: number
          started_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          generation_duration_ms?: number | null
          grade?: string | null
          grade_band?: string
          id?: string
          idempotency_key?: string | null
          items_per_group?: number
          last_heartbeat?: string | null
          max_retries?: number
          mode?: string
          processing_duration_ms?: number | null
          progress_message?: string | null
          progress_percent?: number | null
          progress_stage?: string | null
          result_path?: string | null
          retry_count?: number
          started_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: []
      }
      ai_media_jobs: {
        Row: {
          asset_version: number | null
          attempts: number | null
          completed_at: string | null
          cost_usd: number | null
          course_id: string
          created_at: string
          created_by: string | null
          dead_letter_reason: string | null
          error: string | null
          id: string
          idempotency_key: string | null
          item_id: number
          last_heartbeat: string | null
          media_type: string
          metadata: Json | null
          priority: number | null
          prompt: string
          provider: string | null
          result_url: string | null
          started_at: string | null
          status: string
          style: string | null
          target_ref: Json | null
          updated_at: string
        }
        Insert: {
          asset_version?: number | null
          attempts?: number | null
          completed_at?: string | null
          cost_usd?: number | null
          course_id: string
          created_at?: string
          created_by?: string | null
          dead_letter_reason?: string | null
          error?: string | null
          id?: string
          idempotency_key?: string | null
          item_id: number
          last_heartbeat?: string | null
          media_type: string
          metadata?: Json | null
          priority?: number | null
          prompt: string
          provider?: string | null
          result_url?: string | null
          started_at?: string | null
          status?: string
          style?: string | null
          target_ref?: Json | null
          updated_at?: string
        }
        Update: {
          asset_version?: number | null
          attempts?: number | null
          completed_at?: string | null
          cost_usd?: number | null
          course_id?: string
          created_at?: string
          created_by?: string | null
          dead_letter_reason?: string | null
          error?: string | null
          id?: string
          idempotency_key?: string | null
          item_id?: number
          last_heartbeat?: string | null
          media_type?: string
          metadata?: Json | null
          priority?: number | null
          prompt?: string
          provider?: string | null
          result_url?: string | null
          started_at?: string | null
          status?: string
          style?: string | null
          target_ref?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      assignment_assignees: {
        Row: {
          assignee_type: string
          assignment_id: string
          class_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          assignee_type: string
          assignment_id: string
          class_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          assignee_type?: string
          assignment_id?: string
          class_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_assignees_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_assignees_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          course_id: string
          created_at: string
          created_by: string
          due_at: string | null
          id: string
          org_id: string
          title: string
        }
        Insert: {
          course_id: string
          created_at?: string
          created_by: string
          due_at?: string | null
          id?: string
          org_id: string
          title: string
        }
        Update: {
          course_id?: string
          created_at?: string
          created_by?: string
          due_at?: string | null
          id?: string
          org_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_updates: {
        Row: {
          action: string
          catalog_version: number
          course_id: string
          course_title: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          action: string
          catalog_version: number
          course_id: string
          course_title?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          action?: string
          catalog_version?: number
          course_id?: string
          course_title?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      child_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          student_id: string
          used: boolean
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          student_id: string
          used?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          student_id?: string
          used?: boolean
        }
        Relationships: []
      }
      class_join_codes: {
        Row: {
          class_id: string
          code: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          is_active: boolean
        }
        Insert: {
          class_id: string
          code: string
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          is_active?: boolean
        }
        Update: {
          class_id?: string
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          is_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "class_join_codes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      class_members: {
        Row: {
          class_id: string
          role: string
          user_id: string
        }
        Insert: {
          class_id: string
          role: string
          user_id: string
        }
        Update: {
          class_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_members_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
          owner: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id: string
          owner?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          owner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_embeddings: {
        Row: {
          content_text: string
          content_type: string
          course_id: string
          created_at: string | null
          embedding: string | null
          id: string
          item_id: number
          metadata: Json | null
          organization_id: string | null
          updated_at: string | null
        }
        Insert: {
          content_text: string
          content_type: string
          course_id: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          item_id: number
          metadata?: Json | null
          organization_id?: string | null
          updated_at?: string | null
        }
        Update: {
          content_text?: string
          content_type?: string
          course_id?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          item_id?: number
          metadata?: Json | null
          organization_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_embeddings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      course_metadata: {
        Row: {
          content_version: number
          created_at: string | null
          etag: number
          id: string
          organization_id: string
          tag_ids: string[] | null
          tags: Json | null
          updated_at: string | null
          visibility: string
        }
        Insert: {
          content_version?: number
          created_at?: string | null
          etag?: number
          id: string
          organization_id: string
          tag_ids?: string[] | null
          tags?: Json | null
          updated_at?: string | null
          visibility?: string
        }
        Update: {
          content_version?: number
          created_at?: string | null
          etag?: number
          id?: string
          organization_id?: string
          tag_ids?: string[] | null
          tags?: Json | null
          updated_at?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_metadata_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      course_versions: {
        Row: {
          change_summary: string | null
          course_id: string
          id: string
          metadata_snapshot: Json | null
          published_at: string | null
          published_by: string | null
          storage_path: string
          version: number
        }
        Insert: {
          change_summary?: string | null
          course_id: string
          id?: string
          metadata_snapshot?: Json | null
          published_at?: string | null
          published_by?: string | null
          storage_path: string
          version: number
        }
        Update: {
          change_summary?: string | null
          course_id?: string
          id?: string
          metadata_snapshot?: Json | null
          published_at?: string | null
          published_by?: string | null
          storage_path?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_versions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_metadata"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_versions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_tag_map"
            referencedColumns: ["course_id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          event_data: Json
          event_type: string
          id: string
          idempotency_key: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_data?: Json
          event_type: string
          id?: string
          idempotency_key: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_data?: Json
          event_type?: string
          id?: string
          idempotency_key?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      game_attempts: {
        Row: {
          correct: boolean
          created_at: string
          id: string
          item_id: number
          item_key: string
          latency_ms: number
          round_id: string
          selected_index: number
        }
        Insert: {
          correct: boolean
          created_at?: string
          id?: string
          item_id: number
          item_key?: string
          latency_ms: number
          round_id: string
          selected_index: number
        }
        Update: {
          correct?: boolean
          created_at?: string
          id?: string
          item_id?: number
          item_key?: string
          latency_ms?: number
          round_id?: string
          selected_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_attempts_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "game_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_attempts_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "round_attempts"
            referencedColumns: ["round_id"]
          },
        ]
      }
      game_rounds: {
        Row: {
          base_score: number
          content_version: string
          distinct_items: number
          elapsed_seconds: number
          ended_at: string | null
          final_score: number | null
          id: string
          level: number
          mistakes: number
          session_id: string
          share_enabled: boolean
          share_expires_at: string | null
          share_token: string | null
          started_at: string
        }
        Insert: {
          base_score?: number
          content_version?: string
          distinct_items?: number
          elapsed_seconds?: number
          ended_at?: string | null
          final_score?: number | null
          id?: string
          level: number
          mistakes?: number
          session_id: string
          share_enabled?: boolean
          share_expires_at?: string | null
          share_token?: string | null
          started_at?: string
        }
        Update: {
          base_score?: number
          content_version?: string
          distinct_items?: number
          elapsed_seconds?: number
          ended_at?: string | null
          final_score?: number | null
          id?: string
          level?: number
          mistakes?: number
          session_id?: string
          share_enabled?: boolean
          share_expires_at?: string | null
          share_token?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_rounds_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      game_sessions: {
        Row: {
          assignment_id: string | null
          content_version: string | null
          course_id: string
          ended_at: string | null
          id: string
          started_at: string
          user_id: string | null
        }
        Insert: {
          assignment_id?: string | null
          content_version?: string | null
          course_id: string
          ended_at?: string | null
          id?: string
          started_at?: string
          user_id?: string | null
        }
        Update: {
          assignment_id?: string | null
          content_version?: string | null
          course_id?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          alt_text: string | null
          caption: string | null
          cost_usd: number | null
          created_at: string | null
          created_by: string | null
          dimensions: Json | null
          duration_seconds: number | null
          embedding: string | null
          file_size_bytes: number | null
          id: string
          last_used_at: string | null
          logical_id: string
          media_type: string
          metadata: Json | null
          mime_type: string | null
          model: string | null
          moderation_flags: Json | null
          moderation_status: string | null
          organization_id: string | null
          prompt: string
          provider: string
          public_url: string
          seed: string | null
          status: string
          storage_bucket: string
          storage_path: string
          style: string | null
          usage_count: number | null
          version: number
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          cost_usd?: number | null
          created_at?: string | null
          created_by?: string | null
          dimensions?: Json | null
          duration_seconds?: number | null
          embedding?: string | null
          file_size_bytes?: number | null
          id?: string
          last_used_at?: string | null
          logical_id: string
          media_type: string
          metadata?: Json | null
          mime_type?: string | null
          model?: string | null
          moderation_flags?: Json | null
          moderation_status?: string | null
          organization_id?: string | null
          prompt: string
          provider: string
          public_url: string
          seed?: string | null
          status?: string
          storage_bucket?: string
          storage_path: string
          style?: string | null
          usage_count?: number | null
          version?: number
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          cost_usd?: number | null
          created_at?: string | null
          created_by?: string | null
          dimensions?: Json | null
          duration_seconds?: number | null
          embedding?: string | null
          file_size_bytes?: number | null
          id?: string
          last_used_at?: string | null
          logical_id?: string
          media_type?: string
          metadata?: Json | null
          mime_type?: string | null
          model?: string | null
          moderation_flags?: Json | null
          moderation_status?: string | null
          organization_id?: string | null
          prompt?: string
          provider?: string
          public_url?: string
          seed?: string | null
          status?: string
          storage_bucket?: string
          storage_path?: string
          style?: string | null
          usage_count?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets_search: {
        Row: {
          alt_text: string | null
          bucket: string
          created_at: string | null
          duration_ms: number | null
          embedding: string | null
          height: number | null
          id: string
          mime_type: string
          path: string
          size_bytes: number | null
          tags: string[] | null
          updated_at: string | null
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          bucket: string
          created_at?: string | null
          duration_ms?: number | null
          embedding?: string | null
          height?: number | null
          id?: string
          mime_type: string
          path: string
          size_bytes?: number | null
          tags?: string[] | null
          updated_at?: string | null
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          bucket?: string
          created_at?: string | null
          duration_ms?: number | null
          embedding?: string | null
          height?: number | null
          id?: string
          mime_type?: string
          path?: string
          size_bytes?: number | null
          tags?: string[] | null
          updated_at?: string | null
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: []
      }
      media_generation_providers: {
        Row: {
          avg_generation_time_seconds: number | null
          config: Json | null
          cost_per_unit: number | null
          created_at: string | null
          enabled: boolean | null
          id: string
          media_types: string[]
          name: string
          quality_rating: number | null
          updated_at: string | null
        }
        Insert: {
          avg_generation_time_seconds?: number | null
          config?: Json | null
          cost_per_unit?: number | null
          created_at?: string | null
          enabled?: boolean | null
          id: string
          media_types: string[]
          name: string
          quality_rating?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_generation_time_seconds?: number | null
          config?: Json | null
          cost_per_unit?: number | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          media_types?: string[]
          name?: string
          quality_rating?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      organization_domains: {
        Row: {
          created_at: string | null
          domain: string
          id: string
          is_primary: boolean | null
          organization_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          domain: string
          id?: string
          is_primary?: boolean | null
          organization_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          domain?: string
          id?: string
          is_primary?: boolean | null
          organization_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_domains_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_users: {
        Row: {
          org_id: string
          org_role: string
          user_id: string
        }
        Insert: {
          org_id: string
          org_role: string
          user_id: string
        }
        Update: {
          org_id?: string
          org_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          branding: Json | null
          created_at: string
          id: string
          name: string
          settings: Json | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          branding?: Json | null
          created_at?: string
          id?: string
          name: string
          settings?: Json | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          branding?: Json | null
          created_at?: string
          id?: string
          name?: string
          settings?: Json | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      parent_children: {
        Row: {
          child_id: string
          id: string
          linked_at: string
          parent_id: string
          status: string
        }
        Insert: {
          child_id: string
          id?: string
          linked_at?: string
          parent_id: string
          status?: string
        }
        Update: {
          child_id?: string
          id?: string
          linked_at?: string
          parent_id?: string
          status?: string
        }
        Relationships: []
      }
      pending_invites: {
        Row: {
          accepted: boolean
          class_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          org_id: string
        }
        Insert: {
          accepted?: boolean
          class_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          org_id: string
        }
        Update: {
          accepted?: boolean
          class_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_invites_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      play_sessions: {
        Row: {
          assignment_id: string | null
          course_id: string
          created_at: string
          id: string
          state: Json
          student_id: string
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          course_id: string
          created_at?: string
          id?: string
          state?: Json
          student_id: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          course_id?: string
          created_at?: string
          id?: string
          state?: Json
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "play_sessions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          role?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
        }
        Relationships: []
      }
      round_questions: {
        Row: {
          attempt_id: string | null
          correct_option: number
          created_at: string
          difficulty: string | null
          explanation: string | null
          id: string
          is_correct: boolean
          options: Json
          prompt: string
          question_id: number
          round_id: string
          student_choice: number | null
          topic: string | null
        }
        Insert: {
          attempt_id?: string | null
          correct_option: number
          created_at?: string
          difficulty?: string | null
          explanation?: string | null
          id?: string
          is_correct?: boolean
          options?: Json
          prompt: string
          question_id: number
          round_id: string
          student_choice?: number | null
          topic?: string | null
        }
        Update: {
          attempt_id?: string | null
          correct_option?: number
          created_at?: string
          difficulty?: string | null
          explanation?: string | null
          id?: string
          is_correct?: boolean
          options?: Json
          prompt?: string
          question_id?: number
          round_id?: string
          student_choice?: number | null
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "round_questions_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "game_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_questions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "game_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_questions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "round_attempts"
            referencedColumns: ["round_id"]
          },
        ]
      }
      student_achievements: {
        Row: {
          badge_code: string
          created_at: string
          description: string
          earned_at: string | null
          id: string
          progress_pct: number
          status: string
          student_id: string
          title: string
          updated_at: string
        }
        Insert: {
          badge_code: string
          created_at?: string
          description: string
          earned_at?: string | null
          id?: string
          progress_pct?: number
          status: string
          student_id: string
          title: string
          updated_at?: string
        }
        Update: {
          badge_code?: string
          created_at?: string
          description?: string
          earned_at?: string | null
          id?: string
          progress_pct?: number
          status?: string
          student_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_activity_log: {
        Row: {
          created_at: string
          description: string
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          student_id: string
        }
        Insert: {
          created_at?: string
          description: string
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          student_id: string
        }
        Update: {
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          student_id?: string
        }
        Relationships: []
      }
      student_assignments: {
        Row: {
          assignment_id: string | null
          course_id: string
          created_at: string
          due_at: string | null
          id: string
          progress_pct: number
          score: number | null
          status: string
          student_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          course_id: string
          created_at?: string
          due_at?: string | null
          id?: string
          progress_pct?: number
          score?: number | null
          status: string
          student_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          course_id?: string
          created_at?: string
          due_at?: string | null
          id?: string
          progress_pct?: number
          score?: number | null
          status?: string
          student_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_assignments_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      student_goals: {
        Row: {
          created_at: string
          due_at: string | null
          id: string
          progress_minutes: number
          status: string
          student_id: string
          target_minutes: number
          teacher_note: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_at?: string | null
          id?: string
          progress_minutes?: number
          status?: string
          student_id: string
          target_minutes: number
          teacher_note?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_at?: string | null
          id?: string
          progress_minutes?: number
          status?: string
          student_id?: string
          target_minutes?: number
          teacher_note?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_metrics: {
        Row: {
          created_at: string
          last_login_at: string | null
          streak_days: number
          student_id: string
          updated_at: string
          xp_total: number
        }
        Insert: {
          created_at?: string
          last_login_at?: string | null
          streak_days?: number
          student_id: string
          updated_at?: string
          xp_total?: number
        }
        Update: {
          created_at?: string
          last_login_at?: string | null
          streak_days?: number
          student_id?: string
          updated_at?: string
          xp_total?: number
        }
        Relationships: []
      }
      student_recommendations: {
        Row: {
          course_id: string
          created_at: string
          id: string
          reason: string
          student_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          reason: string
          student_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          reason?: string
          student_id?: string
        }
        Relationships: []
      }
      study_text_generation_jobs: {
        Row: {
          ai_prompt: string | null
          completed_at: string | null
          course_id: string
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          idempotency_key: string | null
          last_heartbeat: string | null
          max_retries: number
          processing_duration_ms: number | null
          result: Json | null
          retry_count: number
          source_files: string[] | null
          source_type: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ai_prompt?: string | null
          completed_at?: string | null
          course_id: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          idempotency_key?: string | null
          last_heartbeat?: string | null
          max_retries?: number
          processing_duration_ms?: number | null
          result?: Json | null
          retry_count?: number
          source_files?: string[] | null
          source_type: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ai_prompt?: string | null
          completed_at?: string | null
          course_id?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          idempotency_key?: string | null
          last_heartbeat?: string | null
          max_retries?: number
          processing_duration_ms?: number | null
          result?: Json | null
          retry_count?: number
          source_files?: string[] | null
          source_type?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tag_approval_queue: {
        Row: {
          course_id: string
          created_at: string | null
          id: string
          mapped_tag_ids: string[] | null
          organization_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          suggested_tags: Json
        }
        Insert: {
          course_id: string
          created_at?: string | null
          id?: string
          mapped_tag_ids?: string[] | null
          organization_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_tags: Json
        }
        Update: {
          course_id?: string
          created_at?: string | null
          id?: string
          mapped_tag_ids?: string[] | null
          organization_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_tags?: Json
        }
        Relationships: [
          {
            foreignKeyName: "tag_approval_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_types: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          is_enabled: boolean | null
          key: string
          label: string
          organization_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_enabled?: boolean | null
          key: string
          label: string
          organization_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_enabled?: boolean | null
          key?: string
          label?: string
          organization_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tag_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          organization_id: string | null
          slug: string
          type_key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          slug: string
          type_key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          slug?: string
          type_key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id?: string | null
          role: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      course_tag_map: {
        Row: {
          course_id: string | null
          organization_id: string | null
          tag_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_metadata_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_child_details: {
        Row: {
          goals_behind_count: number | null
          last_login_at: string | null
          link_status: string | null
          linked_at: string | null
          overdue_assignments_count: number | null
          parent_id: string | null
          recent_activity_count: number | null
          streak_days: number | null
          student_id: string | null
          student_name: string | null
          upcoming_assignments_count: number | null
          xp_total: number | null
        }
        Relationships: []
      }
      round_attempts: {
        Row: {
          assignment_id: string | null
          base_score: number | null
          content_version: string | null
          course_id: string | null
          distinct_items: number | null
          elapsed_seconds: number | null
          ended_at: string | null
          final_score: number | null
          level: number | null
          mistakes: number | null
          round_id: string | null
          score_pct: number | null
          started_at: string | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_ai_job_rate_limit: { Args: { user_id: string }; Returns: boolean }
      generate_child_code: { Args: never; Returns: string }
      generate_join_code: { Args: never; Returns: string }
      generate_media_idempotency_key: {
        Args: {
          p_media_type: string
          p_prompt: string
          p_provider: string
          p_target_ref: Json
        }
        Returns: string
      }
      get_active_tags: {
        Args: { org_id: string; p_type_key: string }
        Returns: {
          id: string
          slug: string
          value: string
        }[]
      }
      get_enabled_tag_types: {
        Args: { org_id: string }
        Returns: {
          display_order: number
          id: string
          key: string
          label: string
        }[]
      }
      get_latest_asset_version: {
        Args: { p_logical_id: string }
        Returns: {
          alt_text: string | null
          caption: string | null
          cost_usd: number | null
          created_at: string | null
          created_by: string | null
          dimensions: Json | null
          duration_seconds: number | null
          embedding: string | null
          file_size_bytes: number | null
          id: string
          last_used_at: string | null
          logical_id: string
          media_type: string
          metadata: Json | null
          mime_type: string | null
          model: string | null
          moderation_flags: Json | null
          moderation_status: string | null
          organization_id: string | null
          prompt: string
          provider: string
          public_url: string
          seed: string | null
          status: string
          storage_bucket: string
          storage_path: string
          style: string | null
          usage_count: number | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "media_assets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_next_catalog_version: { Args: never; Returns: number }
      get_next_pending_job: {
        Args: never
        Returns: {
          course_id: string
          grade: string
          grade_band: string
          id: string
          items_per_group: number
          mode: string
          subject: string
        }[]
      }
      get_next_pending_media_job: {
        Args: never
        Returns: {
          asset_version: number | null
          attempts: number | null
          completed_at: string | null
          cost_usd: number | null
          course_id: string
          created_at: string
          created_by: string | null
          dead_letter_reason: string | null
          error: string | null
          id: string
          idempotency_key: string | null
          item_id: number
          last_heartbeat: string | null
          media_type: string
          metadata: Json | null
          priority: number | null
          prompt: string
          provider: string | null
          result_url: string | null
          started_at: string | null
          status: string
          style: string | null
          target_ref: Json | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ai_media_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_next_pending_study_text_job: {
        Args: never
        Returns: {
          ai_prompt: string | null
          completed_at: string | null
          course_id: string
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          idempotency_key: string | null
          last_heartbeat: string | null
          max_retries: number
          processing_duration_ms: number | null
          result: Json | null
          retry_count: number
          source_files: string[] | null
          source_type: string
          started_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "study_text_generation_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_providers_for_media_type: {
        Args: { p_media_type: string }
        Returns: {
          avg_generation_time_seconds: number | null
          config: Json | null
          cost_per_unit: number | null
          created_at: string | null
          enabled: boolean | null
          id: string
          media_types: string[]
          name: string
          quality_rating: number | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "media_generation_providers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_org_ids: { Args: never; Returns: string[] }
      get_user_role_in_org: { Args: { org_id: string }; Returns: string }
      get_user_roles: {
        Args: never
        Returns: {
          org_id: string
          role_name: string
        }[]
      }
      has_org_role: {
        Args: { org_id: string; required_role: string }
        Returns: boolean
      }
      increment_asset_usage: {
        Args: { p_asset_id: string }
        Returns: undefined
      }
      is_superadmin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      join_class_with_code: {
        Args: { p_code: string; p_user_id: string }
        Returns: {
          already_member: boolean
          class_id: string
          class_name: string
          org_id: string
        }[]
      }
      make_user_admin: { Args: { user_email: string }; Returns: undefined }
      mark_stale_media_jobs: { Args: never; Returns: number }
      move_media_jobs_to_dead_letter: { Args: never; Returns: number }
      process_pending_jobs: { Args: never; Returns: undefined }
      search_assets_by_prompt: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          alt_text: string | null
          caption: string | null
          cost_usd: number | null
          created_at: string | null
          created_by: string | null
          dimensions: Json | null
          duration_seconds: number | null
          embedding: string | null
          file_size_bytes: number | null
          id: string
          last_used_at: string | null
          logical_id: string
          media_type: string
          metadata: Json | null
          mime_type: string | null
          model: string | null
          moderation_flags: Json | null
          moderation_status: string | null
          organization_id: string | null
          prompt: string
          provider: string
          public_url: string
          seed: string | null
          status: string
          storage_bucket: string
          storage_path: string
          style: string | null
          usage_count: number | null
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "media_assets"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      update_job_heartbeat: {
        Args: { job_id: string; job_table?: string }
        Returns: undefined
      }
      user_can_access_assignment: {
        Args: { _assignment_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_org_role:
        | {
            Args: { _org_id: string; _required_role: string; _user_id: string }
            Returns: boolean
          }
        | {
            Args: { _org_id: string; _roles: string[]; _user_id: string }
            Returns: boolean
          }
      user_in_org:
        | { Args: { org_id: string }; Returns: boolean }
        | { Args: { _org_id: string; _user_id: string }; Returns: boolean }
      user_is_org_admin: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      user_is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
