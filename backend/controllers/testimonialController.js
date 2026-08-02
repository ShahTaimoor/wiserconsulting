/**
 * Testimonial Controller
 * Routes and validation boundary for client testimonial records.
 */

const testimonialService = require("../services/testimonialService");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");

class TestimonialController {
  getPublicList = asyncHandler(async (req, res) => {
    const testimonials = await testimonialService.getPublicList();
    return ApiResponse.success(
      res,
      testimonials,
      "Testimonials retrieved successfully",
    );
  });

  getAllForAdmin = asyncHandler(async (req, res) => {
    const testimonials = await testimonialService.getAllForAdmin();
    return ApiResponse.success(
      res,
      testimonials,
      "Testimonials retrieved successfully",
    );
  });

  getById = asyncHandler(async (req, res) => {
    const testimonial = await testimonialService.getById(req.params.id);
    return ApiResponse.success(
      res,
      testimonial,
      "Testimonial retrieved successfully",
    );
  });

  create = asyncHandler(async (req, res) => {
    const testimonial = await testimonialService.create(req.body, req.files);
    return ApiResponse.success(
      res,
      testimonial,
      "Testimonial created successfully",
      201,
    );
  });

  update = asyncHandler(async (req, res) => {
    const testimonial = await testimonialService.update(
      req.params.id,
      req.body,
      req.files,
    );
    return ApiResponse.success(
      res,
      testimonial,
      "Testimonial updated successfully",
      200,
    );
  });

  remove = asyncHandler(async (req, res) => {
    await testimonialService.remove(req.params.id);
    return ApiResponse.success(
      res,
      null,
      "Testimonial deleted successfully",
      200,
    );
  });
}

module.exports = new TestimonialController();
