// websocket/scheduler.js
import { checkAvailability, scheduleAppointment, findNextAvailable } from '../nodes/schedule.node.js';

export class Scheduler {
  async handleScheduling(sessionManager, ttsHandler, ws) {
    const context = sessionManager.getContext();
    if (context.isBookingInProgress) {
      console.log('[Scheduler] Booking already in progress, skipping');
      return;
    }

    const { date, time, duration, staff } = context.pendingScheduling;
    const preferredStaff = staff === 'Any' ? 'Angie' : staff;
    const altStaff = preferredStaff === 'Angie' ? 'Bell' : 'Angie';
    const startTime = new Date(`${date}T${time}:00`);
    const durationMinutes = parseInt(duration.split(' ')[0]);
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

    try {
      context.isBookingInProgress = true;
      const isPreferredAvailable = await checkAvailability(preferredStaff, startTime, endTime);
      let followUpText;

      if (isPreferredAvailable) {
        const eventDetails = {
          staff: preferredStaff,
          summary: `Massage with ${preferredStaff}`,
          start: { dateTime: startTime.toISOString() },
          end: { dateTime: endTime.toISOString() }
        };
        const result = await scheduleAppointment(eventDetails);
        if (result.success) {
          followUpText = `I’ve scheduled you with ${preferredStaff} at ${time} on ${date}.`;
          sessionManager.updateContext({
            pendingScheduling: null,
            bookingConfirmed: true,
            currentState: 'Booking Confirmed'
          });
        } else {
          followUpText = 'There was an issue scheduling your appointment. Could you try another time?';
        }
        await ttsHandler.generateAndSendSpeech(ws, context.streamSid, followUpText);
      } else {
        const isAltAvailable = await checkAvailability(altStaff, startTime, endTime);
        if (isAltAvailable) {
          const eventDetails = {
            staff: altStaff,
            summary: `Massage with ${altStaff}`,
            start: { dateTime: startTime.toISOString() },
            end: { dateTime: endTime.toISOString() }
          };
          const result = await scheduleAppointment(eventDetails);
          if (result.success) {
            followUpText = `${preferredStaff} isn’t available, but I’ve scheduled you with ${altStaff} at ${time} on ${date}.`;
            sessionManager.updateContext({
              pendingScheduling: null,
              bookingConfirmed: true,
              currentState: 'Booking Confirmed'
            });
          } else {
            followUpText = 'There was an issue scheduling your appointment. Could you try another time?';
          }
          await ttsHandler.generateAndSendSpeech(ws, context.streamSid, followUpText);
        } else {
          const nextSlot = await findNextAvailable(preferredStaff, durationMinutes, startTime);
          if (nextSlot) {
            const nextTime = nextSlot.startTime.toTimeString().slice(0, 5);
            const nextDate = nextSlot.startTime.toISOString().slice(0, 10);
            followUpText = `${preferredStaff} is booked at ${time}. The next available slot is ${nextTime} on ${nextDate}. Would that work?`;
            sessionManager.updateContext({
              schedulingAlternative: { staff: preferredStaff, date: nextDate, time: nextTime, duration },
              awaitingConfirmation: true,
              pendingScheduling: null
            });
            await ttsHandler.generateAndSendSpeech(ws, context.streamSid, followUpText);
          } else {
            followUpText = `${preferredStaff} isn’t available soon. Would you like to try a different time or schedule with ${altStaff}?`;
            sessionManager.updateContext({
              schedulingAlternative: { staff: altStaff, date, time, duration },
              awaitingConfirmation: true,
              pendingScheduling: null
            });
            await ttsHandler.generateAndSendSpeech(ws, context.streamSid, followUpText);
          }
        }
      }
    } catch (error) {
      console.error('[Scheduler] Error:', error);
      await ttsHandler.generateAndSendSpeech(ws, context.streamSid, 'Something went wrong while scheduling. Please try again.');
      sessionManager.updateContext({ pendingScheduling: null });
    } finally {
      sessionManager.updateContext({ isBookingInProgress: false });
    }
  }

  async handleConfirmation(transcription, sessionManager, ttsHandler, ws) {
    const context = sessionManager.getContext();
    const lowerText = transcription.toLowerCase();
    const altStaffLower = context.schedulingAlternative.staff.toLowerCase();
    const affirmativeKeywords = ['yes', 'sure', 'okay', 'please', 'i would like', 'schedule with', 'book with'];
    const negativeKeywords = ['no', 'not', 'don’t', 'decline'];

    if (affirmativeKeywords.some(keyword => lowerText.includes(keyword)) || lowerText.includes(altStaffLower)) {
      const { staff, date, time, duration } = context.schedulingAlternative;
      sessionManager.updateContext({
        pendingScheduling: { date, time, duration, staff },
        awaitingConfirmation: false,
        schedulingAlternative: null
      });
      console.log('[Scheduler] User accepted alternative:', { staff, date, time, duration });
    } else if (negativeKeywords.some(keyword => lowerText.includes(keyword))) {
      await ttsHandler.generateAndSendSpeech(ws, context.streamSid, 'Alright, please suggest another time or staff member.');
      sessionManager.updateContext({
        awaitingConfirmation: false,
        schedulingAlternative: null,
        pendingScheduling: null
      });
      console.log('[Scheduler] User declined alternative');
    } else {
      await ttsHandler.generateAndSendSpeech(ws, context.streamSid, 'I didn’t understand. Please say yes or no.');
      console.log('[Scheduler] Unclear response to alternative');
    }
  }
}