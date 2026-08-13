# Supabase Edge Functions

These are the source files used by the dashboard's society-account workflow.

- `create-society-user` creates a society, its Supabase Auth account, and the linked `customer` profile.
- `update-society-user` changes the email and/or password for the customer profile linked to a society.

Deploy `update-society-user` to the same Supabase project before using the **Save Login Details** button in the dashboard. It requires the standard `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` function secrets, and verifies that the caller has the `admin` profile role.
