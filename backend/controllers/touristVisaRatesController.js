/**
 * TouristVisaRates Controller
 * The exchange rates for the currency helper. The route takes no parameter and reads nothing from the request: what is
 * asked of the providers does not depend on who is asking or what they sent.
 */

const touristVisaRatesService = require('../services/touristVisaRatesService');
const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/apiResponse');

class TouristVisaRatesController {
  get = asyncHandler(async (req, res) => {
    const rates = await touristVisaRatesService.get();
    // The rates change once a day: a signed-in browser may keep them for a few minutes, a shared cache never.
    res.set('Cache-Control', 'private, max-age=300');
    return ApiResponse.success(res, rates, 'Rates retrieved successfully');
  })
}

module.exports = new TouristVisaRatesController();
