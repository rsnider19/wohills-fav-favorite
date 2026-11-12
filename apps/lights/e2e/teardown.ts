import { resetLights, service } from './helpers'

/** Leave the local data as `supabase db reset` does: seed state, no admin phone. */
export default async function teardown() {
  await resetLights()
  await service().schema('public').from('admin_config').update({ admin_phone: null }).eq('id', true)
}
