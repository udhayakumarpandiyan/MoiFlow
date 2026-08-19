import notifee, { AndroidImportance, TriggerType, TimestampTrigger } from '@notifee/react-native';
import { eventService } from '../di/container';
import { settingsService } from '../di/container';

/**
 * NotificationService handles scheduling local notifications for upcoming events.
 * When event alarms are enabled, it schedules alerts 1 hour before each event.
 */

const CHANNEL_ID = 'moiflow-event-alarms';
const CHANNEL_NAME = 'Event Alarms';

class NotificationService {
  private channelCreated = false;

  /**
   * Ensure the notification channel exists (required for Android 8+).
   */
  async ensureChannel(): Promise<void> {
    if (this.channelCreated) return;

    await notifee.createChannel({
      id: CHANNEL_ID,
      name: CHANNEL_NAME,
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
    });

    this.channelCreated = true;
  }

  /**
   * Schedule notifications for all upcoming events (1 hour before each).
   * Clears any existing scheduled notifications first to avoid duplicates.
   */
  async scheduleEventAlarms(): Promise<void> {
    const enabled = await settingsService.getEventAlarmEnabled();
    if (!enabled) return;

    await this.ensureChannel();
    await this.cancelAllEventAlarms();

    try {
      const events = await eventService.getAllEvents();
      const now = Date.now();

      for (const event of events) {
        if (!event.date) continue;

        // Parse event date (assume ISO format YYYY-MM-DD or YYYY-MM-DDTHH:mm)
        const eventTime = new Date(event.date).getTime();
        // Schedule 1 hour before
        const alarmTime = eventTime - (60 * 60 * 1000);

        // Only schedule if alarm time is in the future
        if (alarmTime <= now) continue;

        const trigger: TimestampTrigger = {
          type: TriggerType.TIMESTAMP,
          timestamp: alarmTime,
        };

        await notifee.createTriggerNotification(
          {
            id: `event-alarm-${event.id}`,
            title: `🔔 ${event.name}`,
            body: event.venue
              ? `${event.venue} - ${event.villageName ?? ''}`
              : event.villageName ?? 'Upcoming event in 1 hour',
            android: {
              channelId: CHANNEL_ID,
              importance: AndroidImportance.HIGH,
              pressAction: { id: 'default' },
              smallIcon: 'ic_launcher',
            },
          },
          trigger,
        );
      }
    } catch (err) {
      console.error('[NotificationService] schedule error:', err);
    }
  }

  /**
   * Cancel all scheduled event alarm notifications.
   */
  async cancelAllEventAlarms(): Promise<void> {
    try {
      const triggers = await notifee.getTriggerNotificationIds();
      const eventAlarmIds = triggers.filter(id => id.startsWith('event-alarm-'));
      if (eventAlarmIds.length > 0) {
        await notifee.cancelTriggerNotifications(eventAlarmIds);
      }
    } catch (err) {
      console.error('[NotificationService] cancel error:', err);
    }
  }

  /**
   * Request notification permission (needed on Android 13+ / iOS).
   */
  async requestPermission(): Promise<boolean> {
    try {
      const settings = await notifee.requestPermission();
      return settings.authorizationStatus >= 1; // AUTHORIZED or PROVISIONAL
    } catch (err) {
      console.error('[NotificationService] permission error:', err);
      return false;
    }
  }
}

export const notificationService = new NotificationService();
