#!/usr/bin/env node
/**
 * QBH 컬러웨이의 원단명이 "AD-91002-01"처럼 색상코드를 포함해 들어온 경우,
 * QI 가격 마스터의 대표 상품명 "AD-91002"으로 정규화한다.
 *
 * 기본은 dry-run이다. 실제 반영: node scripts/normalize-qbh-fabric-names.mjs --apply
 * 같은 대표명이 타 공급처(HENGLI)에 이미 있는 1831~1833은 잘못 합쳐지는 것을 막기 위해 건너뛴다.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
  if (!match) continue;
  let value = match[2];
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  env[match[1]] = value;
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const digits = (value) => String(value ?? "").match(/\d+/g)?.join("") ?? "";
const EXCLUDED_TARGETS = new Set(["1831", "1832", "1833"]); // HENGLI와 동명: RPC name 그룹 충돌 방지

async function fetchAll(query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query.range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const [qbhRows, priceRows] = await Promise.all([
  fetchAll(supabase.from("fabrics").select("id,name,color_code").eq("supplier", "QBH")),
  fetchAll(supabase.from("fabric_knowledge_master").select("product_name").eq("brand_code", "QI").eq("is_active", true)),
]);

const namesByDigits = new Map();
for (const row of priceRows) {
  const key = digits(row.product_name);
  if (!key) continue;
  const names = namesByDigits.get(key) ?? new Set();
  names.add(row.product_name);
  namesByDigits.set(key, names);
}

const existingNameColors = new Set(qbhRows.map((row) => `${row.name}|${row.color_code}`));
const skippedDuplicateNameColors = [];
const changes = qbhRows.flatMap((row) => {
  const color = String(row.color_code ?? "").trim();
  const sourceName = String(row.name ?? "").trim();
  const sourceWithoutColor = color && sourceName.endsWith(`-${color}`)
    ? sourceName.slice(0, -(color.length + 1))
    : sourceName;
  const candidates = namesByDigits.get(digits(sourceWithoutColor));
  if (!candidates || candidates.size !== 1) return [];
  const targetName = [...candidates][0];
  if (sourceName === targetName || EXCLUDED_TARGETS.has(targetName)) return [];
  // unique_fabric_color(name, color_code) 충돌은 기존 대표 컬러웨이를 보존하고 별도 검토한다.
  if (existingNameColors.has(`${targetName}|${color}`)) {
    skippedDuplicateNameColors.push({ sourceName, targetName, color });
    return [];
  }
  return [{ id: row.id, sourceName, targetName, color }];
});

if (!process.argv.includes("--apply")) {
  console.log(JSON.stringify({ mode: "dry-run", changes: changes.length, skippedDuplicateNameColors, examples: changes.slice(0, 10) }, null, 2));
  process.exit(0);
}

for (const change of changes) {
  const { error } = await supabase.from("fabrics").update({ name: change.targetName }).eq("id", change.id).eq("supplier", "QBH");
  if (error) throw new Error(`${change.sourceName} → ${change.targetName}: ${error.message}`);
}

console.log(JSON.stringify({ mode: "applied", changes: changes.length, targets: [...new Set(changes.map((x) => x.targetName))] }, null, 2));
