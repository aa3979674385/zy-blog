-- 0029: Email verification codes table for registration
-- Stores 6-digit verification codes sent to users before registration.
-- Each code expires after 5 minutes and can only be used once.

CREATE TABLE "email_verification_codes" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "code" text NOT NULL,
  "expires_at" integer NOT NULL,
  "used" integer DEFAULT 0 NOT NULL,
  "created_at" integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);

CREATE INDEX "email_verification_codes_email_idx" ON "email_verification_codes" ("email");
CREATE INDEX "email_verification_codes_expires_at_idx" ON "email_verification_codes" ("expires_at");
