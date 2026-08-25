/** API response shapes (allow-listed server DTOs; see docs/api/API_SPECIFICATION.md). */

export interface Me {
  id: string;
  email: string;
  email_verified: boolean;
  phone: string | null;
  phone_verified: boolean;
  roles: string[];
  status: string;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  requires_identity_verification: boolean;
  requires_background_check: boolean;
}

export interface JobCard {
  id: string;
  title: string;
  category_id: string;
  state: string;
  city: string;
  region: string;
  approx_location: { lat: number; lng: number };
  distance_m?: number;
  urgency: string;
  scheduled_start_at: string | null;
  estimated_duration_minutes: number;
  workers_needed: number;
  workers_filled: number;
  pay_type: 'FLAT' | 'HOURLY';
  pay_cents: number;
  currency: string;
}

export interface JobDetail extends Partial<JobCard> {
  id: string;
  title: string;
  description: string;
  state: string;
  address_line1?: string;
  access_instructions?: string | null;
  special_instructions?: string | null;
  physical_requirements?: string | null;
  my_assignment?: Assignment;
  assignments?: Assignment[];
  pay_type: 'FLAT' | 'HOURLY';
  pay_cents: number;
  estimated_duration_minutes: number;
  workers_needed: number;
  workers_filled: number;
  scheduled_start_at: string | null;
}

export interface Assignment {
  id: string;
  job_id: string;
  worker_user_id: string;
  state: string;
  earnings_cents: string | null;
  job?: JobDetail;
}

export interface Conversation {
  id: string;
  job_id: string;
  job_title: string;
  customer_user_id: string;
  worker_user_id: string;
  unread_count: string | number;
  last_message: string | null;
}

export interface Message {
  id: string;
  seq: string | number;
  sender_user_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
}

export interface Earnings {
  pending_cents: number;
  in_transit_cents: number;
  paid_cents: number;
  today_cents: number;
  week_cents: number;
  month_cents: number;
  currency: string;
}

export interface WorkerProfile {
  user_id: string;
  display_name: string;
  bio: string | null;
  service_radius_m: number;
  available_now: boolean;
  rating_avg: string | null;
  rating_count: number;
  jobs_completed: number;
  skill_ids: string[];
  category_ids: string[];
  home_location_set: boolean;
}

export function formatMoney(cents: number, payType?: 'FLAT' | 'HOURLY'): string {
  const dollars = `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
  return payType === 'HOURLY' ? `${dollars}/hr` : dollars;
}

export function formatDistance(meters?: number): string {
  if (meters === undefined) return '';
  return `${(meters / 1609.34).toFixed(1)} mi`;
}
