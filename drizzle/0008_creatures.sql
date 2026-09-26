CREATE TABLE "creature_days" (
	"user_id" text NOT NULL,
	"day" text NOT NULL,
	"completed" integer NOT NULL,
	"scheduled" integer NOT NULL,
	"exp_paid" integer NOT NULL,
	CONSTRAINT "creature_days_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "creature_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "creatures" (
	"user_id" text NOT NULL,
	"line" text NOT NULL,
	"exp" integer DEFAULT 0 NOT NULL,
	"slot" smallint,
	CONSTRAINT "creatures_user_id_line_pk" PRIMARY KEY("user_id","line"),
	CONSTRAINT "creatures_user_slot_key" UNIQUE("user_id","slot"),
	CONSTRAINT "creatures_slot_check" CHECK ("creatures"."slot" between 0 and 4)
);
--> statement-breakpoint
ALTER TABLE "creatures" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "creature_days" ADD CONSTRAINT "creature_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creatures" ADD CONSTRAINT "creatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "creature_days_owner" ON "creature_days" AS PERMISSIVE FOR ALL TO public USING (user_id = current_setting('openhabits.user_id', true)) WITH CHECK (user_id = current_setting('openhabits.user_id', true));--> statement-breakpoint
CREATE POLICY "creatures_owner" ON "creatures" AS PERMISSIVE FOR ALL TO public USING (user_id = current_setting('openhabits.user_id', true)) WITH CHECK (user_id = current_setting('openhabits.user_id', true));--> statement-breakpoint
-- Hand-written, as in 0006: drizzle-kit cannot generate FORCE, and without it the
-- policies above never apply to the tables' owner (DESIGN.md 13.15).
ALTER TABLE "creatures" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "creature_days" FORCE ROW LEVEL SECURITY;
