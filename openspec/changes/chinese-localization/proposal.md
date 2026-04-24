# Chinese Localization Proposal

## Summary
Translate the Panshi Admin application (both frontend and backend) to Simplified Chinese.

## Motivation
Provide a localized experience for Chinese-speaking users of the multi-cluster gateway management platform.

## Changes

### Frontend Localization
- Create `src/locales/zh-CN.ts` with all UI strings
- Update Login.vue, Dashboard.vue, UserList.vue, ClusterList.vue, ClusterDetail.vue, DictTypeList.vue, DefaultLayout.vue
- Convert all buttons, labels, placeholders, table headers to Chinese

### Backend Localization
- Update validation error messages in Pydantic schemas
- Update authentication error messages
- Update API response messages to Chinese

### Testing
- Add unit tests in `tests/test_localization.py` to verify Chinese messages
- Add Playwright tests to verify Chinese UI renders correctly

## Deliverables
1. Frontend Chinese locale file with complete translations
2. Updated Vue components using Chinese text
3. Backend error messages in Chinese
4. Unit tests for localization
5. Playwright tests verifying Chinese UI