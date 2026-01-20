import { useState, useCallback } from 'react'
import type { NotificationType } from '@/components/Notification'

interface NotificationState {
  type: NotificationType
  message: string
}

export function useNotification() {
  const [notification, setNotification] = useState<NotificationState | null>(null)

  const showNotification = useCallback((type: NotificationType, message: string) => {
    setNotification({ type, message })
  }, [])

  const hideNotification = useCallback(() => {
    setNotification(null)
  }, [])

  const showSuccess = useCallback((message: string) => {
    showNotification('success', message)
  }, [showNotification])

  const showError = useCallback((message: string) => {
    showNotification('error', message)
  }, [showNotification])

  return {
    notification,
    showNotification,
    hideNotification,
    showSuccess,
    showError,
  }
}
