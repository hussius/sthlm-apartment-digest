CREATE TABLE "sent_listings" (
	"lagenhet_id" bigint PRIMARY KEY NOT NULL,
	"annons_id" bigint,
	"bucket" text NOT NULL,
	"address" text,
	"district" text,
	"deadline" date,
	"first_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb
);
