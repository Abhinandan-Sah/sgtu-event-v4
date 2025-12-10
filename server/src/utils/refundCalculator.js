/**
 * Refund Calculator Utility
 * Calculates refund eligibility and amount based on event refund policy
 */

/**
 * Calculate refund eligibility and amount
 * @param {Object} event - Event object with refund configuration
 * @param {Date} currentDate - Current date/time
 * @returns {Object} { eligible, amount, percent, reason }
 */
export const calculateRefund = (event, currentDate = new Date()) => {
  // Check 1: Refunds enabled?
  if (!event.refund_enabled) {
    return {
      eligible: false,
      amount: 0,
      percent: 0,
      reason: 'Refunds not enabled for this event'
    };
  }

  // Check 2: Event must be paid type
  if (event.event_type !== 'PAID') {
    return {
      eligible: false,
      amount: 0,
      percent: 0,
      reason: 'Free events do not have refunds'
    };
  }

  // Calculate time until event
  const eventStartDate = new Date(event.start_date);
  const hoursUntilEvent = (eventStartDate - currentDate) / (1000 * 60 * 60);

  // Check 3: Event already passed?
  if (hoursUntilEvent < 0) {
    return {
      eligible: false,
      amount: 0,
      percent: 0,
      reason: 'Event has already occurred'
    };
  }

  // Check 4: Past cancellation deadline?
  if (event.cancellation_deadline_hours && hoursUntilEvent < event.cancellation_deadline_hours) {
    return {
      eligible: false,
      amount: 0,
      percent: 0,
      reason: `Cancellation deadline passed (must cancel ${event.cancellation_deadline_hours} hours before event)`
    };
  }

  // Calculate days until event
  const daysUntilEvent = Math.ceil(hoursUntilEvent / 24);

  // Check if refund_tiers exist
  if (!event.refund_tiers || !Array.isArray(event.refund_tiers) || event.refund_tiers.length === 0) {
    // Default: full refund if no tiers defined
    return {
      eligible: true,
      amount: parseFloat(event.price),
      percent: 100,
      reason: 'Full refund (no tiers defined)'
    };
  }

  // Sort tiers by days_before (descending)
  const sortedTiers = [...event.refund_tiers].sort((a, b) => b.days_before - a.days_before);

  // Match refund tier
  for (const tier of sortedTiers) {
    if (daysUntilEvent >= tier.days_before) {
      const refundAmount = (parseFloat(event.price) * tier.percent) / 100;

      return {
        eligible: true,
        amount: parseFloat(refundAmount.toFixed(2)),
        percent: tier.percent,
        reason: `${tier.percent}% refund (${daysUntilEvent} days before event)`
      };
    }
  }

  // No matching tier found
  return {
    eligible: false,
    amount: 0,
    percent: 0,
    reason: 'No refund tier matches current timeframe'
  };
};

/**
 * Validate refund tiers configuration
 * @param {Array} tiers - Array of refund tier objects
 * @returns {Object} { valid, error }
 */
export const validateRefundTiers = (tiers) => {
  if (!Array.isArray(tiers)) {
    return { valid: false, error: 'Refund tiers must be an array' };
  }

  for (const tier of tiers) {
    if (typeof tier.days_before !== 'number' || tier.days_before < 0) {
      return { valid: false, error: 'days_before must be a non-negative number' };
    }

    if (typeof tier.percent !== 'number' || tier.percent < 0 || tier.percent > 100) {
      return { valid: false, error: 'percent must be between 0 and 100' };
    }
  }

  return { valid: true };
};

export default { calculateRefund, validateRefundTiers };
