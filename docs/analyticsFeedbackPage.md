# Dashboard Analytics and Feedback Page
*Last updated: 2025-09-08*

This document outlines a recommended layout for the analytics and feedback page in the Next.js dashboard (`Cicero_Web`). The goal is to present social media statistics and user feedback in a clear, actionable format so administrators can make policy decisions and plan news content.

## Page Layout

1. **Header**
   - Page title and date range selector.
   - Dropdown to switch between Instagram and TikTok data.

2. **Key Metrics**
   - Summary cards showing total posts, likes, comments, and engagement rate for the selected period.
   - Compare current values to the previous period using percentage indicators.

3. **Engagement Graphs**
   - Line chart of daily engagement (likes + comments).
   - Bar chart of top posts by interactions.
   - Heatmap of posting times versus engagement.

4. **Audience Breakdown**
   - Pie chart showing follower demographics (gender, age groups) if available.
   - Table of top locations or hashtags driving traffic.

5. **Feedback Section**
   - Table listing user comments flagged as feedback with sentiment analysis scores.
   - Quick filter for positive, neutral, and negative comments.
   - Button to export feedback as CSV for further review.

6. **Action Items**
   - Text area or checklist for administrators to note follow‑up actions.
   - Link to create a policy or news plan based on the insights.

## Implementation Notes

- Fetch analytics data via `/api/insta/*` or `/api/tiktok/*` endpoints.
- Store feedback in a dedicated table (e.g., `user_feedback`) and expose it through `/api/feedback`.
- Charts can be rendered using a library like Chart.js on the dashboard.
- Keep API responses paginated to improve load time.

This layout ensures that both analytics and user feedback are visible at a glance, allowing the team to evaluate performance trends and incorporate audience input into future content strategies.
