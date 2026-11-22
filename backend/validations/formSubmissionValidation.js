/**
 * FormSubmission Validation Schemas using Zod
 */

const { z } = require('zod');

// The form is documents only: who applied comes from the account, and the travel details are optional (kept for older clients).
const optionalText = z.string().trim().optional();
const createSubmissionSchema = z.object({
  body: z.object({
    name: optionalText,
    email: z.string().email('Invalid email format').trim().toLowerCase().optional().or(z.literal('')),
    phone: optionalText,
    destinationCountry: optionalText,
    otherCountry: optionalText,
    visaType: optionalText,
    fromDate: z.string().optional(),
    toDate: z.string().optional(),
    purpose: optionalText
  })
});

const updateStatusSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Submission ID is required')
  }),
  body: z.object({
    status: z.enum(['pending', 'reviewed', 'contacted', 'completed'], {
      errorMap: () => ({ message: 'Status must be one of: pending, reviewed, contacted, completed' })
    })
  })
});

const addAdminCommentSchema = z.object({
  params: z.object({
    submissionId: z.string().min(1, 'Submission ID is required'),
    documentId: z.string().min(1, 'Document ID is required')
  }),
  body: z.object({
    comment: z.string().min(1, 'Comment is required').trim()
  })
});

const addCustomerCommentSchema = z.object({
  params: z.object({
    submissionId: z.string().min(1, 'Submission ID is required')
  }),
  body: z.object({
    message: z.string().min(1, 'Message is required').trim()
  })
});

const getSubmissionByEmailSchema = z.object({
  params: z.object({
    email: z.string().email('Invalid email format')
  })
});

const deleteSubmissionSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Submission ID is required')
  })
});

const getFileUrlSchema = z.object({
  params: z.object({
    submissionId: z.string().min(1, 'Submission ID is required'),
    documentId: z.string().min(1, 'Document ID is required')
  })
});

module.exports = {
  createSubmissionSchema,
  updateStatusSchema,
  addAdminCommentSchema,
  addCustomerCommentSchema,
  getSubmissionByEmailSchema,
  deleteSubmissionSchema,
  getFileUrlSchema
};

