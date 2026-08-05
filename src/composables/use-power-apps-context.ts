import { ref, onMounted } from 'vue'

export interface PowerAppsUserContext {
  userId?: string
  userName?: string
  email?: string
  environmentId?: string
  isHosted: boolean
}

/**
 * Loads Power Apps host context without blocking first paint in local play.
 */
export function usePowerAppsContext() {
  const context = ref<PowerAppsUserContext>({ isHosted: false })
  const isLoading = ref(true)
  const error = ref<string | null>(null)

  onMounted(() => {
    void loadContext()
  })

  async function loadContext(): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const { getContext } = await import('@microsoft/power-apps/app')
      const hostContext = await Promise.race([
        getContext(),
        new Promise<null>((resolve) => {
          window.setTimeout(() => resolve(null), 1500)
        }),
      ])

      if (!hostContext) {
        context.value = {
          isHosted: false,
          userName: 'Local Developer',
          email: 'developer@contoso.com',
        }
        return
      }

      context.value = {
        isHosted: true,
        userId: hostContext.user?.objectId,
        userName: hostContext.user?.fullName,
        email: hostContext.user?.userPrincipalName,
        environmentId: hostContext.app?.environmentId,
      }
    } catch (loadError) {
      error.value =
        loadError instanceof Error ? loadError.message : 'Failed to load Power Apps context'
      context.value = {
        isHosted: false,
        userName: 'Local Developer',
        email: 'developer@contoso.com',
      }
    } finally {
      isLoading.value = false
    }
  }

  return { context, isLoading, error }
}
