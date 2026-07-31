import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const client = new Client({ connectionString: databaseUrl });
await client.connect();
const householdId = crypto.randomUUID();
const fixtureSize = 5_000;

try {
  await client.query("begin");
  await client.query(
    "insert into households (id, name, slug) values ($1, 'Performance fixture', $2)",
    [householdId, `performance-${householdId}`],
  );
  await client.query(
    `insert into products (id, household_id, name, brand, model, purchase_date, updated_at)
     select md5($1 || ':product:' || value)::uuid,
            $1::uuid,
            'Fixture product ' || value,
            'Fixture brand ' || (value % 20),
            'Model ' || value,
            current_date - (value % 2000),
            now() - make_interval(secs => value)
       from generate_series(1, $2::int) value`,
    [householdId, fixtureSize],
  );
  await client.query(
    `insert into product_serials (product_id, value)
     select md5($1 || ':product:' || value)::uuid, 'SERIAL-' || value
       from generate_series(1, $2::int) value`,
    [householdId, fixtureSize],
  );
  await client.query(
    `insert into product_images (product_id, storage_key, thumbnail_storage_key, "primary")
     select md5($1 || ':product:' || value)::uuid,
            'images/' || value || '.jpg',
            'images/thumbnails/' || value || '.webp',
            true
       from generate_series(1, $2::int) value`,
    [householdId, fixtureSize],
  );
  await client.query(
    `insert into warranties (product_id, ends_at)
     select md5($1 || ':product:' || value)::uuid,
            current_date + (value % 1000)
       from generate_series(1, $2::int) value`,
    [householdId, fixtureSize],
  );
  await client.query(
    `insert into claims (id, household_id, product_id, reference, issue, status, updated_at)
     select md5($1 || ':claim:' || value)::uuid,
            $1::uuid,
            md5($1 || ':product:' || value)::uuid,
            'PERF-' || value,
            'Fixture issue ' || value,
            case when value % 5 = 0 then 'closed'::claim_status else 'in_review'::claim_status end,
            now() - make_interval(secs => value)
       from generate_series(1, $2::int) value`,
    [householdId, fixtureSize],
  );
  await client.query(
    `insert into notes (household_id, product_id, claim_id, body)
     select $1::uuid,
            md5($1 || ':product:' || value)::uuid,
            md5($1 || ':claim:' || value)::uuid,
            'Fixture note ' || value
       from generate_series(1, $2::int) value`,
    [householdId, fixtureSize],
  );
  await client.query(
    `insert into documents (household_id, product_id, claim_id, backend, name)
     select $1::uuid,
            md5($1 || ':product:' || value)::uuid,
            md5($1 || ':claim:' || value)::uuid,
            'local'::document_backend,
            'Fixture document ' || value
       from generate_series(1, $2::int) value`,
    [householdId, fixtureSize],
  );
  await client.query(
    "analyze products, product_serials, product_images, warranties, claims, notes, documents",
  );

  const productIds = await client
    .query<{ id: string }>(
      `select id from products where household_id = $1
       order by purchase_date desc nulls last, id desc limit 48`,
      [householdId],
    )
    .then((result) => result.rows.map((row) => row.id));
  const firstClaimId = await client
    .query<{ id: string }>(
      "select id from claims where household_id = $1 order by updated_at desc limit 1",
      [householdId],
    )
    .then((result) => result.rows[0].id);
  const plans = [
    {
      name: "active inventory page",
      text: `select id from products
              where household_id = $1 and archived_at is null
              order by purchase_date desc nulls last, id desc limit 49`,
      values: [householdId],
    },
    {
      name: "inventory search candidate window",
      text: `select id from products
              where household_id = $1 and archived_at is null
              order by purchase_date desc nulls last, id desc limit 1001`,
      values: [householdId],
    },
    {
      name: "expiring warranty page",
      text: `select p.id from products p
              where p.household_id = $1
                and p.archived_at is null
                and not exists (
                  select 1 from warranties lifetime
                  where lifetime.product_id = p.id and lifetime.lifetime = true
                )
                and (
                  select max(w.ends_at) from warranties w
                  where w.product_id = p.id and w.lifetime = false
                ) between current_date and current_date + interval '60 days'
              order by (
                select max(w.ends_at) from warranties w
                where w.product_id = p.id and w.lifetime = false
              ), p.id limit 49`,
      values: [householdId],
    },
    {
      name: "summary image projection",
      text: `select distinct on (product_id) product_id, id
              from product_images where product_id = any($1::uuid[])
              order by product_id, "primary" desc, created_at desc, id desc`,
      values: [productIds],
    },
    {
      name: "summary serial projection",
      text: `select product_id, value from product_serials
              where product_id = any($1::uuid[])
              order by product_id, created_at, id`,
      values: [productIds],
    },
    {
      name: "claim note timeline",
      text: `select id from notes where claim_id = $1
              order by created_at desc, id desc limit 201`,
      values: [firstClaimId],
    },
  ];
  const results = [];
  for (const plan of plans) {
    const result = await client.query({
      text: `explain (analyze, buffers, costs off, format json) ${plan.text}`,
      values: plan.values,
    });
    results.push({ name: plan.name, explain: result.rows[0]["QUERY PLAN"][0] });
  }
  const postgresVersion = await client
    .query<{ version: string }>("select version()")
    .then((result) => result.rows[0].version);
  console.log(
    JSON.stringify(
      { postgresVersion, fixtureSize, householdId, plans: results },
      null,
      2,
    ),
  );
} finally {
  await client.query("rollback").catch(() => undefined);
  await client.end();
}
