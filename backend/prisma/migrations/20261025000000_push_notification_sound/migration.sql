-- Additive preference only: existing devices keep the legacy notification channel.
ALTER TABLE "push_devices" ADD COLUMN "notificationChannelId" VARCHAR(80);
