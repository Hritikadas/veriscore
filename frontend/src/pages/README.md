# Frontend Pages

This directory contains page-level component views for the Veriscore application:
- Landing Page view (`Landing.jsx` + `Landing.css`) — the marketing-style entry screen shown before the verification UI.

The main application verification view lives in `src/App.jsx` and switches between the Landing page and the verification demo via the `view` state (`"landing" | "app"`).