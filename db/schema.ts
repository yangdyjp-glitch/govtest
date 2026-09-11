import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    disabled: integer("disabled").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("users_email").on(t.email)],
);
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
export const invitations = sqliteTable("invitations", {
  email: text("email").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
});
export const banks = sqliteTable("banks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  questions: text("questions").notNull(),
  count: integer("count").notNull(),
  archived: integer("archived").notNull().default(0),
  createdAt: text("created_at").notNull(),
});
export const attempts = sqliteTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    bankId: text("bank_id").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull(),
    questions: text("questions").notNull(),
    states: text("states").notNull(),
    current: integer("current").notNull().default(0),
    revision: integer("revision").notNull().default(0),
    syncToken: text("sync_token"),
    createdAt: text("created_at").notNull(),
    submittedAt: text("submitted_at"),
  },
  (t) => [index("attempts_user_status").on(t.userId, t.status)],
);
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempts.id),
    payload: text("payload").notNull(),
  },
  (t) => [index("events_attempt").on(t.attemptId)],
);
