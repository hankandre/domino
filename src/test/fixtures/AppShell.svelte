<script lang="ts">
  import Layout from "../../routes/+layout.svelte";

  const data = {
    actor: {
      id: "11111111-1111-4111-8111-111111111111",
      householdId: "22222222-2222-4222-8222-222222222222",
      kind: "user" as const,
      permissions: ["*"],
      claimAccessScope: "all" as const,
      claimIds: undefined,
      user: {
        id: "33333333-3333-4333-8333-333333333333",
        email: "owner@example.test",
        displayName: "Household owner",
      },
    },
    demoMode: true,
    documentStore: "Domino storage",
    oidc: { enabled: false, providerName: "OIDC" },
  };
</script>

<Layout {data}>
  <section class="p-4" aria-labelledby="fixture-heading">
    <h1 id="fixture-heading">Household inventory</h1>
    <p>Fixture content</p>
  </section>
</Layout>
