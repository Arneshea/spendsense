"""
backend/db.py — Supabase client initialisation for SpendSense.

Provides two clients:
  • supabase      — uses the anon key; used server-side with a user JWT
                    injected per-request so RLS applies correctly.
  • supabase_admin — uses the service-role key; bypasses RLS.
                    Only used in the new-user trigger fallback.
"""

import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY: str = os.environ["SUPABASE_ANON_KEY"]
SUPABASE_SERVICE_ROLE_KEY: str = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Anon client — RLS enforced via per-request JWT (see get_user_client)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

# Admin client — bypasses RLS; use sparingly
supabase_admin: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def get_user_client(jwt: str) -> Client:
    """
    Return an anon Supabase client authenticated as the calling user.
    Pass this client into every data query so RLS policies fire correctly.
    """
    client: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.auth.set_session(access_token=jwt, refresh_token="")
    return client