/**
 * Tuition Meet - Pricing Plans Configuration
 * Centralized source of truth for pricing to prevent fraud
 */

const PLANS = {
    DAILY_RATE: 69,
    ACADEMIC_YEAR_RATE: 16999,
    TRIAL_DAYS: 7
};

/**
 * Validates and calculates the price for a given number of days
 * @param {number} days 
 * @returns {number|null} The expected amount in INR, or null if invalid
 */
const calculateExpectedAmount = (days) => {
    // Academic Year Special Case
    if (days === 365) {
        return PLANS.ACADEMIC_YEAR_RATE;
    }

    // Standard daily rate calculation
    // Minimum 1 day, Maximum 365 (though usually people buy monthly 30/31)
    if (days >= 1 && days < 365) {
        return days * PLANS.DAILY_RATE;
    }

    return null;
};

module.exports = {
    PLANS,
    calculateExpectedAmount
};
