import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { existsSync } from "node:fs";

const migrationRoot = existsSync(new URL("../../supabase/migrations/0008_web_dashboard.sql", import.meta.url))
  ? new URL("../../supabase/migrations/", import.meta.url)
  : new URL("../supabase/migrations/", import.meta.url);

test("dashboard SQL enforces account boundaries and rejects stale settings saves", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('session_id',current_setting('test.session_id',true)) $$;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default now());
      grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;
      create table public.profiles(user_id uuid,profile_index integer,name text default 'Test profile',unique(user_id,profile_index));
      create table public.profile_settings_blobs(user_id uuid,profile_id integer,platform text,settings_json jsonb,updated_at timestamptz,origin_client_id text,primary key(user_id,profile_id,platform));
      create table public.registered_devices(user_id uuid,installation_id text,device_name text,platform text,client_name text,client_version text,last_seen_at timestamptz,primary key(user_id,installation_id));
      alter table profile_settings_blobs enable row level security;
      create policy owner on profile_settings_blobs for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
      grant select on profiles to authenticated;
      grant select,insert,update on profile_settings_blobs,registered_devices to authenticated;
      insert into auth.users(id,email,email_confirmed_at) values('11111111-1111-4111-8111-111111111111','owner@example.test',now()),('22222222-2222-4222-8222-222222222222','member@example.test',now());
      insert into profiles(user_id,profile_index) values('11111111-1111-4111-8111-111111111111',1),('22222222-2222-4222-8222-222222222222',1);
      insert into auth.sessions(id,user_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222');
    `);
    const sql = await readFile(
      new URL("0008_web_dashboard.sql", migrationRoot),
      "utf8",
    );
    await db.exec(sql);
    const membership = await readFile(
      new URL("0009_manual_supporters.sql", migrationRoot),
      "utf8",
    );
    await db.exec(membership);
    await db.exec(
      await readFile(
        new URL("0010_media_servers.sql", migrationRoot),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL("0011_community_collections.sql", migrationRoot),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL("0012_device_link.sql", migrationRoot),
        "utf8",
      ),
    );
    await db.exec(
      `insert into anivio_admins(user_id) values('11111111-1111-4111-8111-111111111111');`,
    );
    // Idempotency matters when the dashboard is being installed on a live app backend.
    await db.exec(sql);
    await db.exec(
      `set role authenticated;set test.user_id='11111111-1111-4111-8111-111111111111';set test.session_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';`,
    );
    await db.query(`select sync_push_addons(1,$1::jsonb)`, [
      JSON.stringify([
        { url: "https://example.com/manifest.json", name: "Private source" },
      ]),
    ]);
    const sources = await db.query("select * from addons");
    assert.equal(sources.rows.length, 1); // Same table the Android app pulls.
    const first = await db.query(
      `select web_patch_mobile_settings(1,'{"theme_settings":{"selected_theme":{"type":"string","value":"GOLD"}},"future_feature":{"keep":true}}',null) as revision`,
    );
    await assert.rejects(
      db.query(`select web_patch_mobile_settings(1,'{}',null)`),
      /another device/,
    );
    const second = await db.query(
      `select web_patch_mobile_settings(1,'{"player_settings":{"preload_next_episode":{"type":"boolean","value":true}}}',$1::timestamptz)`,
      [first.rows[0].revision],
    );
    assert.equal(second.rows.length, 1);
    const saved = await db.query(
      "select settings_json from profile_settings_blobs",
    );
    assert.equal(
      saved.rows[0].settings_json.features.future_feature.keep,
      true,
    );
    const forbidden = await db.query(
      `select revoke_my_session('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') as revoked`,
    );
    assert.equal(forbidden.rows[0].revoked, false);
    await db.exec(`set test.user_id='22222222-2222-4222-8222-222222222222';`);
    assert.equal((await db.query("select * from addons")).rows.length, 0);
    assert.equal(
      (await db.query("select * from profile_settings_blobs")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from list_my_sessions()")).rows.length,
      1,
    );
    await assert.rejects(
      db.query(
        `select admin_set_supporter('22222222-2222-4222-8222-222222222222','SUPPORTER')`,
      ),
      /Administrator access required/,
    );
    await assert.rejects(
      db.query(
        `insert into anivio_admins(user_id) values('22222222-2222-4222-8222-222222222222')`,
      ),
      /permission denied/,
    );
    await db.exec(`set test.user_id='11111111-1111-4111-8111-111111111111';`);
    await db.query(
      `select admin_set_supporter('22222222-2222-4222-8222-222222222222','SUPPORTER')`,
    );
    await db.exec(`set test.user_id='22222222-2222-4222-8222-222222222222';`);
    const member = await db.query("select * from get_my_member_access()");
    assert.equal(member.rows[0].tier, "SUPPORTER");
    assert.ok(member.rows[0].entitlements.includes("GOLD_THEME"));
    await db.exec(`set test.user_id='11111111-1111-4111-8111-111111111111';`);
    await db.query(
      `select admin_set_supporter('22222222-2222-4222-8222-222222222222',null)`,
    );
    await db.exec(`set test.user_id='22222222-2222-4222-8222-222222222222';`);
    assert.equal(
      (await db.query("select * from get_my_member_access()")).rows.length,
      0,
    );
    await db.exec(`set test.user_id='11111111-1111-4111-8111-111111111111';`);
    await db.query(
      `select sync_push_collections(1,'[{"id":"original","title":"Test collection","folders":[]}]')`,
    );
    await db.query(
      `select submit_community_collection(1,'original','Test description')`,
    );
    assert.equal(
      (await db.query("select * from browse_community_collections()")).rows
        .length,
      0,
    );
    const publications = await db.query(
      "select * from admin_community_collections()",
    );
    const publication = publications.rows[0].id;
    await db.exec(`set test.user_id='22222222-2222-4222-8222-222222222222';`);
    await assert.rejects(
      db.query(`select import_community_collection(1,$1)`, [publication]),
      /Approved collection not found/,
    );
    await assert.rejects(
      db.query(`select admin_review_collection($1,'approved')`, [publication]),
      /Administrator access required/,
    );
    await db.exec(`set test.user_id='11111111-1111-4111-8111-111111111111';`);
    await db.query(`select admin_review_collection($1,'approved')`, [
      publication,
    ]);
    await db.exec(`set role anon;`);
    assert.equal(
      (await db.query("select * from browse_community_collections()")).rows
        .length,
      1,
    );
    await assert.rejects(
      db.query("select * from community_collections"),
      /permission denied/,
    );
    await db.exec(
      `set role authenticated;set test.user_id='22222222-2222-4222-8222-222222222222';`,
    );
    const copied = await db.query(
      `select import_community_collection(1,$1) as id`,
      [publication],
    );
    assert.notEqual(copied.rows[0].id, "original");
    const owned = await db.query("select * from sync_pull_collections(1)");
    assert.equal(owned.rows[0].collections_json[0].id, copied.rows[0].id);
    await db.exec("set role anon");
    const nonce = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const device = (
      await db.query(
        `select * from start_device_login_session($1,'https://example.test/link','My phone','mobile')`,
        [nonce],
      )
    ).rows[0];
    assert.match(device.device_code, /^[a-f0-9]{64}$/);
    assert.equal(
      (
        await db.query(
          `select * from poll_tv_login_session($1,'wrong-nonce')`,
          [device.device_code],
        )
      ).rows[0].status,
      "expired",
    );
    await assert.rejects(
      db.query("select * from device_login_sessions"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select approve_tv_login_session($1)", [device.user_code]),
      /permission denied/,
    );
    await db.exec(
      `set role authenticated;set test.user_id='11111111-1111-4111-8111-111111111111';`,
    );
    await db.query("select approve_tv_login_session($1)", [device.user_code]);
    await assert.rejects(
      db.query("select * from consume_device_login($1,$2)", [
        device.device_code,
        nonce,
      ]),
      /permission denied/,
    );
    await db.exec("set role service_role");
    await assert.rejects(
      db.query("select * from consume_device_login($1,$2)", [
        device.device_code,
        "wrong-nonce",
      ]),
      /unavailable/,
    );
    const claim = await db.query("select * from consume_device_login($1,$2)", [
      device.device_code,
      nonce,
    ]);
    assert.equal(claim.rows[0].user_id, "11111111-1111-4111-8111-111111111111");
    await assert.rejects(
      db.query("select * from consume_device_login($1,$2)", [
        device.device_code,
        nonce,
      ]),
      /unavailable/,
    );
  } finally {
    await db.close();
  }
});
