// Business logic helpers - extracted from components

import { AdminUser } from '@/services/adminService';
import { FormSubmission } from '@/services/adminService';

/**
 * Filters users by role
 */
export const filterUsersByRole = (users: AdminUser[], roleFilter: string): AdminUser[] => {
  if (roleFilter === 'all') {
    return users;
  }
  
  return users.filter(user => 
    roleFilter === 'admin' ? user.role === 1 : user.role === 0
  );
};

/**
 * Filters submissions by status
 */
export const filterSubmissionsByStatus = (
  submissions: FormSubmission[],
  statusFilter: string
): FormSubmission[] => {
  if (statusFilter === 'all') {
    return submissions;
  }
  
  return submissions.filter(submission => submission.status === statusFilter);
};

/**
 * Gets file URL from document
 */
export const getFileUrl = (doc: { cloudinaryUrl?: string; filename?: string; originalname?: string }): string | null => {
  if (!doc.cloudinaryUrl) return null;

  // If it's already a full URL, return it
  if (doc.cloudinaryUrl.startsWith('http')) {
    return doc.cloudinaryUrl;
  }

  // If it's a relative URL, make it absolute
  const backendUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5000';
  return `${backendUrl}${doc.cloudinaryUrl}`;
};

