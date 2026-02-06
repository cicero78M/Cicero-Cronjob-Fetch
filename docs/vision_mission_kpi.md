# Cicero Vision and KPI
*Last updated: 2025-06-25*

This document outlines the vision, mission, objectives, and key performance indicators for the **Cicero** platform. The backend (this repository) works in tandem with the Next.js dashboard to deliver social media analytics and reporting.

## Vision

To become an integrated monitoring platform that allows organizations and clients to analyze Instagram and TikTok performance comprehensively.

## Mission

1. Provide an easy‑to‑use dashboard for viewing social media statistics fetched from the backend.
2. Facilitate analysis of posts and profiles through REST endpoints such as `/insta/*` and `/tiktok/*`.
3. Support multi-user login without session limits.
4. Enable comparisons between accounts, tracking of TikTok comments, posting heatmaps, engagement graphs, and other analytics features.

## Objectives

- Offer a single portal for managing client social media performance.
- Deliver quantitative insights on engagement metrics (likes, comments, shares, views) and trending hashtags or mentions.
- Simplify daily monitoring of comments and posts to accelerate decision making.

## Desired Outcomes

- Dashboards display up-to-date statistics with informative charts.
- Users can directly compare client accounts with competitors.
- TikTok comment recaps and Instagram/TikTok metrics are available in both table and chart form.
- The system handles multi-user logins and processes multiple accounts efficiently.

## Key Performance Indicators

1. **Uptime & Response Time**
   - Dashboard and API uptime ≥ 99%.
   - Average API response time under one second.
2. **Feature Usage**
   - Number of connected Instagram/TikTok accounts per client.
   - Frequency of access to analytics pages.
3. **Accuracy of Statistics**
   - Engagement data matches results fetched from `/api/insta/rapid-posts` and `/api/tiktok/rapid-posts`.
4. **Activity Growth**
   - Increase in total posts analyzed each month.
   - Count of reports downloaded by users.
5. **User Satisfaction**
   - Positive feedback regarding dashboard usability and information completeness.
   - Ratio of daily active users to total clients.


Refer to [docs/naming_conventions.md](naming_conventions.md) for code style guidelines.
