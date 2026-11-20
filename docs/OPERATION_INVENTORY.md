# جرد استدعاءات الصفحات — 2026-10-27

جرد آلي لاستدعاءات api المباشرة، وليس إثباتًا لاختبار كل زر. لا يشمل الاستدعاءات المخبأة في مكونات مشتركة أو خدمات مساعدة؛ يلزم استكمال الفحص الوظيفي لكل دور في بيئة اختبار.

## frontend/src/pages/AboutPage.tsx

لا توجد استدعاءات api مباشرة في هذه الصفحة.

## frontend/src/pages/AccountDeletionPage.tsx

- السطر 13: POST '/support/account-deletion'

## frontend/src/pages/ActivityPage.tsx

- السطر 15: GET '/dashboard/activity'

## frontend/src/pages/announcements/AnnouncementsPage.tsx

- السطر 61: GET '/announcements'
- السطر 69: DELETE /announcements/${id}
- السطر 80: PATCH /announcements/${a.id}
- السطر 328: PATCH /announcements/${announcement.id}
- السطر 333: POST '/announcements'

## frontend/src/pages/attendance/AbsencePermissionsPage.tsx

- السطر 24: GET '/students'
- السطر 26: GET '/students/me'
- السطر 28: GET '/attendance/absence-permissions'
- السطر 29: GET '/attendance/summons'
- السطر 32: POST '/attendance/absence-permissions'
- السطر 33: PATCH /attendance/absence-permissions/${id}/${action}
- السطر 34: POST '/attendance/summons'

## frontend/src/pages/attendance/AttendancePage.tsx

- السطر 71: GET '/circles/options'
- السطر 118: GET '/attendance/sheet'
- السطر 174: POST '/attendance'
- السطر 458: GET '/attendance/history'
- السطر 473: GET /attendance/history/${openCircle!.date}/${openCircle!.circleId}
- السطر 481: PATCH /attendance/${id}
- السطر 494: GET '/attendance/stats'

## frontend/src/pages/BroadcastPage.tsx

- السطر 17: GET '/notifications/recipients'
- السطر 27: POST '/notifications/broadcast'

## frontend/src/pages/CertificatesAdminPage.tsx

- السطر 190: GET '/certificates/monthly-report-data'
- السطر 191: GET '/certificates/issued'
- السطر 192: GET '/certificates/templates'
- السطر 193: GET '/certificates/requests'
- السطر 194: GET '/students'
- السطر 196: POST '/certificates/templates'
- السطر 197: PATCH '/certificates/templates/'+id+'/deactivate'
- السطر 198: PATCH '/certificates/requests/'+id+'/decision'
- السطر 207: POST '/certificates/issue'
- السطر 276: POST '/certificates/monthly-reports/issue'

## frontend/src/pages/chat/ChatPage.tsx

- السطر 86: GET '/chat/conversations'
- السطر 92: GET /chat/conversations/${id}
- السطر 99: GET /chat/conversations/${id}/messages
- السطر 105: PATCH /chat/conversations/${conversationId}/read
- السطر 113: POST /chat/conversations/${id}/messages
- السطر 126: PATCH /chat/conversations/${id}/messages/${messageId}
- السطر 138: DELETE /chat/conversations/${id}/messages/${messageId}
- السطر 588: PATCH /chat/conversations/${conversation.id}/members/${userId}
- السطر 597: DELETE /chat/conversations/${conversation.id}/members/${userId}
- السطر 695: GET '/users/directory'
- السطر 701: POST /chat/conversations/${conversation.id}/members
- السطر 777: PATCH /chat/conversations/${conversation.id}
- السطر 788: DELETE /chat/conversations/${conversation.id}/members/me
- السطر 897: GET '/users/directory'
- السطر 905: POST '/chat/conversations/direct'
- السطر 907: POST '/chat/conversations/group'

## frontend/src/pages/circles/CircleDetailsPage.tsx

- السطر 61: GET /circles/${id}
- السطر 67: GET /attendance/circle/${id}/summary
- السطر 73: GET /circles/${id}/history
- السطر 78: DELETE /circles/${id}/teachers/${teacherId}
- السطر 450: GET '/teachers'
- السطر 456: PATCH /circles/${circleId}/primary-teacher
- السطر 457: POST /circles/${circleId}/assistants
- السطر 525: GET '/users'
- السطر 544: PATCH /circles/${circle.id}

## frontend/src/pages/circles/CirclesPage.tsx

- السطر 48: GET '/circles'
- السطر 77: DELETE /circles/${id}
- السطر 273: GET '/users'
- السطر 279: GET '/teachers'
- السطر 294: POST '/circles'

## frontend/src/pages/community/CommunityPage.tsx

- السطر 17: GET '/community/users/'+userId
- السطر 19: GET '/community/feed'
- السطر 20: GET '/community/school'
- السطر 21: GET '/community/stories'
- السطر 22: GET '/community/stories/'+selectedStory+'/replies'
- السطر 38: GET '/community/school/follow'
- السطر 39: DELETE path
- السطر 39: PATCH path
- السطر 39: POST path

## frontend/src/pages/courses/CourseDetailsPage.tsx

- السطر 41: GET /courses/${id}
- السطر 124: DELETE /courses/${course.id}/students/${studentId}
- السطر 250: GET '/students'
- السطر 259: POST /courses/${courseId}/students
- السطر 334: GET /courses/${courseId}/attendance/sheet
- السطر 340: POST /courses/${courseId}/attendance
- السطر 449: GET /courses/${courseId}/attendance/history
- السطر 454: GET /courses/${courseId}/attendance/${openDate}

## frontend/src/pages/courses/CoursesPage.tsx

- السطر 58: GET '/courses'
- السطر 66: GET '/courses/stats'
- السطر 71: DELETE /courses/${id}
- السطر 80: POST '/courses/bulk-delete'
- السطر 389: GET '/users/staff'
- السطر 401: PATCH /courses/${course.id}
- السطر 402: POST '/courses'

## frontend/src/pages/DashboardPage.tsx

- السطر 75: GET '/dashboard/overview'

## frontend/src/pages/DonationsPage.tsx

- السطر 20: GET '/settings/public'

## frontend/src/pages/ErrorPages.tsx

لا توجد استدعاءات api مباشرة في هذه الصفحة.

## frontend/src/pages/exams/CombinedTab.tsx

- السطر 10: GET '/students'
- السطر 12: GET '/exams'
- السطر 13: GET /exams/milestones/${student!.id}
- السطر 13: GET '/exams/requests'
- السطر 13: GET '/exams/sections'
- السطر 16: POST '/exams/requests'
- السطر 17: PATCH '/exams/requests/'+editingRequest.id

## frontend/src/pages/exams/CommitteesTab.tsx

- السطر 18: PATCH '/exams/committees/'+committee.id+'/grading-settings'
- السطر 25: GET '/examCommittees'
- السطر 27: GET '/exams'
- السطر 29: PATCH '/exams/'+moving!.id
- السطر 46: GET '/teachers'
- السطر 48: REQUEST {method:committee?'patch':'post',url:committee?/examCommittees/${committee.id}:'/examCommittees',data:{number,heldAt:new Date(heldAt).toISOString(),location,members,notes}}
- السطر 53: GET '/students'
- السطر 54: GET '/exams/sections'
- السطر 55: POST '/exams/historical'

## frontend/src/pages/exams/ExamProgressionTable.tsx

- السطر 44: GET /exams/milestones/${studentId}
- السطر 50: GET '/exams/requests'
- السطر 54: POST '/exams/requests'
- السطر 66: PATCH /exams/milestones/${studentId}/${sectionId}

## frontend/src/pages/exams/ExamsPage.tsx

- السطر 105: GET '/students'
- السطر 110: GET /exams/eligibility/${progressStudent!.id}
- السطر 115: GET '/exams'
- السطر 120: GET '/exams/stats'
- السطر 209: GET '/exams/requests'
- السطر 216: PATCH /exams/requests/${id}/cancel
- السطر 358: GET '/exams'
- السطر 365: PATCH /exams/${id}/absent
- السطر 511: GET '/exams/examiners'
- السطر 523: GET '/examCommittees'
- السطر 527: POST /exams/requests/${request.id}/schedule
- السطر 582: PATCH /exams/requests/${request.id}/reject
- السطر 622: PATCH /exams/${exam.id}
- السطر 680: GET '/students'
- السطر 685: GET /exams/eligibility/${student!.id}
- السطر 695: POST '/exams/requests'

## frontend/src/pages/LoginPage.tsx

- السطر 31: GET '/settings/public'
- السطر 192: POST '/support/public'

## frontend/src/pages/MediaActivitiesPage.tsx

- السطر 67: GET '/media-activities'
- السطر 69: POST '/media-activities'
- السطر 74: DELETE '/media-activities/' + id
- السطر 90: GET '/media-activities'

## frontend/src/pages/MeetingsPage.tsx

- السطر 16: GET '/meetings'
- السطر 17: DELETE /meetings/${id}
- السطر 30: REQUEST {method:meeting?'patch':'post',url:meeting?/meetings/${meeting.id}:'/meetings',data:{title,heldAt,attendees:attendees.split(/[\n،,]/).map(value=>value.trim()).filter(Boolean),notes,sections}}

## frontend/src/pages/NotificationSoundSettingsPage.tsx

لا توجد استدعاءات api مباشرة في هذه الصفحة.

## frontend/src/pages/NotificationsPage.tsx

- السطر 37: GET '/notifications'
- السطر 44: PATCH /notifications/${id}/read
- السطر 52: PATCH '/notifications/read-all'
- السطر 61: DELETE /notifications/${id}

## frontend/src/pages/OfflineSettingsPage.tsx

لا توجد استدعاءات api مباشرة في هذه الصفحة.

## frontend/src/pages/parent/ParentChildDetailsPage.tsx

- السطر 36: GET '/parents/my-children'
- السطر 41: GET /parents/my-children/${id}

## frontend/src/pages/parent/ParentChildrenPage.tsx

- السطر 40: GET '/parents/my-children'

## frontend/src/pages/parents/ParentsPage.tsx

- السطر 43: GET '/parents'
- السطر 50: DELETE /parents/${id}
- السطر 192: POST '/parents'
- السطر 267: GET '/students'
- السطر 272: PATCH /parents/${parent.id}/students

## frontend/src/pages/PasswordRequestsPage.tsx

- السطر 8: GET '/support'

## frontend/src/pages/PrayerReminderSettingsPage.tsx

لا توجد استدعاءات api مباشرة في هذه الصفحة.

## frontend/src/pages/PrayerTimesPage.tsx

لا توجد استدعاءات api مباشرة في هذه الصفحة.

## frontend/src/pages/PrivacyPage.tsx

- السطر 10: GET '/settings/public'

## frontend/src/pages/ProfilePage.tsx

- السطر 43: GET '/auth/me'
- السطر 53: PATCH '/auth/change-password'
- السطر 196: PATCH '/community/nickname'
- السطر 286: POST '/uploads/avatar'
- السطر 287: PATCH '/auth/profile'
- السطر 288: GET '/auth/me'
- السطر 301: PATCH '/auth/profile'
- السطر 302: GET '/auth/me'
- السطر 395: PATCH '/auth/profile'
- السطر 402: GET '/auth/me'

## frontend/src/pages/ProfileVerificationPage.tsx

- السطر 15: GET '/profile-reviews/me'
- السطر 17: POST '/profile-reviews'
- السطر 48: GET '/profile-reviews'
- السطر 53: PATCH /profile-reviews/${id}/decision

## frontend/src/pages/recitations/RecitationsPage.tsx

- السطر 62: GET '/circles/options'
- السطر 69: GET '/recitations/history'
- السطر 85: GET /recitations/history/${openCircle!.date}/${openCircle!.circleId}
- السطر 91: DELETE /recitations/${id}
- السطر 395: GET '/circles/options'
- السطر 400: GET '/recitations/surahs'
- السطر 407: GET '/students'
- السطر 417: POST '/recitations'

## frontend/src/pages/RegistryAdminPage.tsx

- السطر 8: GET '/registry/admin/stats'
- السطر 8: GET '/registry/admin/users'
- السطر 9: POST '/registry/admin/import'
- السطر 10: GET path
- السطر 17: POST '/registry/admin/users/'+u.id+'/invitation'
- السطر 17: PATCH '/registry/admin/users/'+u.id+'/active'
- السطر 17: DELETE '/registry/admin/users/'+u.id
- السطر 20: PATCH '/registry/admin/users/'+editing!.id

## frontend/src/pages/RegistryDataPage.tsx

لا توجد استدعاءات api مباشرة في هذه الصفحة.

## frontend/src/pages/RegistryLoginPage.tsx

لا توجد استدعاءات api مباشرة في هذه الصفحة.

## frontend/src/pages/ReportsPage.tsx

- السطر 59: GET '/circles/options'
- السطر 60: GET '/courses'
- السطر 63: GET '/students'
- السطر 64: GET '/teachers'
- السطر 66: GET '/reports'

## frontend/src/pages/SchedulesPage.tsx

- السطر 35: GET '/schedules/media'
- السطر 36: PATCH '/schedules/media/' + editing
- السطر 36: POST '/schedules/media'
- السطر 39: DELETE '/schedules/media/' + id
- السطر 59: GET '/schedules/duties'
- السطر 60: GET '/schedules/teachers'
- السطر 61: PATCH '/schedules/duties/' + editing
- السطر 61: POST '/schedules/duties'
- السطر 64: DELETE '/schedules/duties/' + id

## frontend/src/pages/SettingsPage.tsx

- السطر 45: GET '/settings'
- السطر 56: PATCH '/settings'
- السطر 68: POST '/settings/logo'
- السطر 78: DELETE '/settings/logo'

## frontend/src/pages/staff/StaffAttendancePage.tsx

- السطر 75: GET '/staff-attendance/sheet'
- السطر 84: POST '/staff-attendance'
- السطر 205: GET '/staff-attendance/history'
- السطر 210: GET /staff-attendance/history/${openDate}
- السطر 278: GET '/staff-attendance/summary'

## frontend/src/pages/staff/StaffPage.tsx

- السطر 43: GET '/users/staff'

## frontend/src/pages/StudentFilesPage.tsx

- السطر 20: GET '/certificates/requests/mine'
- السطر 21: GET '/certificates/mine'
- السطر 23: POST '/certificates/requests'

## frontend/src/pages/StudentPortalPage.tsx

- السطر 26: PATCH '/auth/change-password'
- السطر 49: GET '/students/me'
- السطر 55: GET '/students/me/history'
- السطر 158: GET '/preparations'

## frontend/src/pages/students/StudentAccountsPage.tsx

- السطر 11: GET '/students/accounts'
- السطر 12: GET '/students'
- السطر 13: POST /students/${id}/account
- السطر 14: POST '/students/accounts/reset-password-bulk'
- السطر 15: PATCH /students/${a.id}/account/active
- السطر 16: POST '/students/accounts/export-with-temporary-passwords'

## frontend/src/pages/students/StudentDetailsPage.tsx

- السطر 128: GET /students/${id}
- السطر 134: GET /students/${id}/history
- السطر 140: GET '/exams/requests'
- السطر 147: GET '/attendance'
- السطر 154: GET '/recitations'
- السطر 160: GET /recitations/student/${id}/progress
- السطر 166: GET /exams/eligibility/${id}
- السطر 172: GET '/exams'
- السطر 178: GET /students/${id}/notes
- السطر 185: PATCH /exams/requests/${requestId}/reject
- السطر 194: DELETE /exams/${examId}
- السطر 203: DELETE /students/${id}/notes/${noteId}
- السطر 677: GET '/exams/requests'
- السطر 683: GET '/exams'
- السطر 1046: PATCH /students/${student.id}/evaluation
- السطر 1102: POST /students/${studentId}/notes
- السطر 1147: POST '/transfers/students'
- السطر 1199: POST '/suspensions'
- السطر 1269: GET '/circles/options'
- السطر 1283: PATCH /students/${student.id}
- السطر 1398: GET '/recitations/surahs'
- السطر 1403: POST /students/${student.id}/surahs
- السطر 1414: DELETE /students/${student.id}/surahs/${completionId}
- السطر 1609: GET '/preparations'
- السطر 1617: PATCH /preparations/${id}/${done ? 'complete' : 'reopen'}
- السطر 1700: GET '/recitations/surahs'
- السطر 1706: POST '/preparations'
- السطر 1807: GET /exams/eligibility/${student.id}
- السطر 1817: POST '/exams/requests'

## frontend/src/pages/students/StudentsPage.tsx

- السطر 72: GET '/circles/options'
- السطر 97: GET '/students'
- السطر 144: DELETE /students/${id}
- السطر 153: POST '/students/bulk-delete'
- السطر 213: GET '/students/import-template'
- السطر 234: POST '/students/import-excel'
- السطر 237: POST '/students/credentials-export'
- السطر 574: GET '/courses'
- السطر 594: POST '/students'
- السطر 766: GET '/circles/options'
- السطر 773: POST /suspensions/students/${student.id}/return

## frontend/src/pages/supervisors/SupervisorsPage.tsx

- السطر 38: GET '/users/staff'

## frontend/src/pages/support/SupportPage.tsx

- السطر 52: GET '/support/stats'
- السطر 59: GET '/support'
- السطر 234: POST '/support'

## frontend/src/pages/support/SupportTicketPage.tsx

- السطر 43: GET /support/${id}
- السطر 49: GET '/support/staff'
- السطر 54: POST /support/${id}/reply
- السطر 65: PATCH /support/${id}

## frontend/src/pages/suspensions/SuspensionsPage.tsx

- السطر 42: GET '/suspensions/active'
- السطر 48: GET '/suspensions'
- السطر 218: GET '/suspensions'
- السطر 225: PATCH /suspensions/${id}/cancel
- السطر 399: PATCH /suspensions/${request.id}/${approve ? 'approve' : 'reject'}
- السطر 595: GET '/circles/options'
- السطر 601: PATCH /suspensions/${suspension.id}/return

## frontend/src/pages/teachers/TeacherDetailsPage.tsx

- السطر 35: GET /teachers/${id}
- السطر 248: PATCH /teachers/${teacher.id}

## frontend/src/pages/teachers/TeachersPage.tsx

- السطر 50: GET '/teachers'
- السطر 64: DELETE /teachers/${id}
- السطر 273: POST '/teachers'
- السطر 373: GET '/teachers'
- السطر 380: POST '/transfers/teachers/swap'

## frontend/src/pages/transfers/TransfersPage.tsx

- السطر 46: GET '/transfers'
- السطر 53: PATCH /transfers/${id}/cancel
- السطر 252: GET '/circles/options'
- السطر 258: PATCH /transfers/${request.id}/${approve ? 'approve' : 'reject'}

## frontend/src/pages/users/UsersPage.tsx

- السطر 50: GET '/users/stats'
- السطر 57: GET '/users'
- السطر 71: PATCH /users/${id}/${activate ? 'activate' : 'deactivate'}
- السطر 80: DELETE /users/${id}
- السطر 89: POST '/users/bulk-delete'
- السطر 378: PATCH /users/${user!.id}
- السطر 378: POST '/users'
- السطر 477: PATCH /users/${user.id}/reset-password

