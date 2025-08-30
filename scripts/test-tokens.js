#!/usr/bin/env node
const { saveServiceToken, getServiceTokenMetadata, getPlainToken, updateLastUsed, deleteServiceToken } = require('../packages/services/tokens/src')

async function main() {
  console.log('== Tokens service smoke test ==')
  const created = await saveServiceToken('github', 'ghp_example_token_value', 'GitHub Token')
  console.log('Created:', { ...created, last_used: created.last_used ? created.last_used.toISOString() : null })

  const meta = await getServiceTokenMetadata('github')
  console.log('Metadata:', { ...meta, last_used: meta?.last_used ? meta.last_used.toISOString() : null })

  const token = await getPlainToken('github')
  console.log('Plain token length:', token ? token.length : null)

  await updateLastUsed('github')
  const meta2 = await getServiceTokenMetadata('github')
  console.log('Updated last_used:', meta2?.last_used?.toISOString?.())

  const ok = await deleteServiceToken(created.id)
  console.log('Deleted:', ok)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

