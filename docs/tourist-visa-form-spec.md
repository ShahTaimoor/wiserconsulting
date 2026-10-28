# Tourist Visa Form: Question Specification

Oct 28, 2026

## Overview

This spec lists every question in the Tourist Visa form, in the order an applicant sees them, so it can be reviewed before any code is written.

The question set follows the UK visitor application printout we were given. Only the questions were taken from it; no applicant answers appear anywhere in this document.

**How the form works**

- A signed-in applicant starts a Tourist Visa application and completes it section by section.
- Each section is saved with Save and continue, so an application can be left and resumed.
- A Yes/No answer can open follow-up questions or a repeating group. No skips them.
- A review page shows all answers before the final submit.
- After submit, the admin sees the full application and can export it as a PDF in the same layout as the printout.

**Scope.** UK visitor (tourist) visa only. Other visa types and other countries' forms are out of scope for this version.

**Status of this spec.** The printout only shows follow-up questions for the answers that one applicant gave, so some Yes/No paths and dropdown lists are not visible. They are collected under Gaps to confirm instead of being guessed.

## Answer types and rules

Every question uses one of the answer types below, so the form can be built from this list instead of screen by screen.

| Code | Answer type | Notes |
| --- | --- | --- |
| TXT | Short text | One line |
| LNG | Long text | Several lines; character limit to confirm |
| DATE | Full date | Day, month and year |
| MY | Month and year | Used where the printout shows no day |
| NUM | Whole number | |
| DUR | Duration | A number plus a unit (days, weeks, months or years); the address question uses years and months |
| AMT | Amount | A number plus currency; the printout uses GBP |
| YN | Yes / No | Single choice |
| SEL | Dropdown | One choice from a fixed list |
| CTRY | Country | Dropdown with a standard country list |
| CHK | Checklist | One or more choices from a fixed list |
| ADDR | Address block | Lines, town, region, postcode, country |
| TEL | Telephone | With country code |
| EML | Email | Format checked |
| ACK | Acknowledgement | A tick the applicant must give to continue |
| FILE | Upload | PDF or image; types and size limit to confirm |

**Required column.** R = required. O = optional. C = required only when its Shows when condition is met.

**Shows when column.** Always = shown to every applicant. A condition such as 2.3 = Yes means the question appears only when question 2.3 is answered Yes. Hidden questions are not validated, and answers to them are discarded when the controlling answer changes.

**Numbering.** Questions are numbered Part.number, for example 2.3. Questions inside a repeating group are lettered, for example 4.8a. Conditions refer to these numbers.

**Repeating groups.** A group is a set of questions the applicant can fill in more than once, one entry per person, place or visit.

- Yes/No gate: Yes opens the first entry, and Add another appears after each entry.
- Count: a How many times question sets the number of entries.
- Every entry can be edited or removed before submit.
- Proposed limit: 20 entries per group, to confirm.

**Proposed validation** (not shown on the printout, added to prevent rejected or inconsistent applications):

- The leave date is after the arrive date, and every expiry date is after its issue date.
- The passport expiry date is after the planned leave date.
- Each place of stay falls inside the travel dates, and stays do not overlap.
- The three questions asking which email address to use pick from the addresses already entered.

## Parts 1 and 2: Travel and personal information

These parts cover why and when the applicant is travelling, then who they are and how to reach them.

### Part 1: Travel information

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 1.1 | What is the main reason for your visit to the UK? | SEL | R | Always; options to confirm |
| 1.2 | Will you be travelling to the UK as part of an organised group? | YN | R | Always; Yes path to confirm |
| 1.3 | Will you be travelling to the UK with someone who is not your partner, spouse or dependant? | YN | R | Always; Yes path to confirm |
| 1.4 | What is the main reason for your holiday visit to the UK? | SEL | C | 1.1 is the tourism option; options to confirm |
| 1.5 | Give details of the main purpose of your visit and anything else you plan to do on your trip. | LNG | R | Always; the printout links this question to the tourist and short stays guidance |
| 1.6 | Date you plan to arrive in the UK | DATE | R | Always |
| 1.7 | Date you plan to leave the UK | DATE | R | Always; must be after 1.6 |

### Part 2: Personal information

**2A. Name, email and contact preferences**

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 2.1 | Given name(s) | TXT | R | Always |
| 2.2 | Family name | TXT | R | Always |
| 2.3 | Are you now or have you ever been known by another name? | YN | R | Always |
| 2.3a | Given name(s) | TXT | C | 2.3 = Yes; repeating group with 2.3b, Add another; fields to confirm |
| 2.3b | Family name | TXT | C | 2.3 = Yes; repeating group with 2.3a |
| 2.4 | Email address | EML | R | Always; proposed: pre-filled from the account email, editable |
| 2.5 | Who does this email address belong to? | SEL | R | Always; options to confirm |
| 2.6 | Do you have another email address? | YN | R | Always |
| 2.7 | Additional email address | EML | C | 2.6 = Yes; one address or several, to confirm |
| 2.8 | Who does this email address belong to? | SEL | C | 2.6 = Yes |
| 2.9 | Which email address should we use to contact you with any questions about your application? | SEL | R | Picks from the addresses in 2.4 and 2.7 |
| 2.10 | Which email address should we use to send a decision on your application? | SEL | R | Picks from the addresses in 2.4 and 2.7 |
| 2.11 | Which email address should we use to communicate with you after your application has been decided? | SEL | R | Picks from the addresses in 2.4 and 2.7 |

**2B. Identity and background**

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 2.12 | What is your sex, as shown in your passport or travel document? | SEL | R | Always; options to confirm |
| 2.13 | What is your relationship status? | SEL | R | Always; options to confirm; the answer decides whether the spouse or partner questions in Part 4 appear |
| 2.14 | Country of nationality | CTRY | R | Always |
| 2.15 | Country of birth | CTRY | R | Always |
| 2.16 | Place of birth | TXT | R | Always |
| 2.17 | Date of birth | DATE | R | Always |
| 2.18 | Do you have a valid national identity card? | YN | R | Always |
| 2.19 | National identity card number | TXT | C | 2.18 = Yes |
| 2.20 | Issuing authority | TXT | C | 2.18 = Yes |
| 2.21 | Issue date (if applicable) | DATE | C | 2.18 = Yes |
| 2.22 | Expiry date (if applicable) | DATE | C | 2.18 = Yes; after 2.21 |
| 2.23 | Do you currently hold, or have you ever held, any other nationality or citizenship? | YN | R | Always; Yes path to confirm |

**2C. Address and living situation**

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 2.24 | Address | ADDR | R | Always |
| 2.25 | Is this address also your correspondence address? | YN | R | Always |
| 2.26 | Address (correspondence) | ADDR | C | The printout shows this block even when 2.25 = Yes, as a copy of 2.24. Proposed: ask only when 2.25 = No, and copy 2.24 into the record when Yes |
| 2.27 | How long have you lived at this address? | DUR | R | Always; years and months |
| 2.28 | What is the ownership status of your home? | SEL | R | Always; options to confirm |
| 2.29 | Give more details about your living situation, such as who you live with and who owns the property | LNG | C | Shown on the printout for the Other option of 2.28; full condition to confirm |
| 2.30 | Do you have a UK driving licence? | YN | R | Always; Yes path to confirm |
| 2.31 | Have you ever been given medical treatment in the UK? | YN | R | Always; Yes path to confirm |

**2D. Telephone**

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 2.32 | Provide your telephone number | TEL | R | Always |
| 2.33 | Where do you use this telephone number? | SEL | R | Always; options to confirm |
| 2.34 | Select whether this is your home, mobile or work telephone number | SEL | R | Always |
| 2.35 | Are you able to be contacted by telephone? | CHK | R | Always; options to confirm, the printout shows telephone call and text message (SMS) as choices |

## Parts 3 and 4: Passport and family

Part 3 records the passport. Part 4 records the spouse or partner, dependants and parents, mostly as repeating groups.

### Part 3: Passport details

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 3.1 | Passport number or travel document reference number | TXT | R | Always |
| 3.2 | Issuing authority | TXT | R | Always |
| 3.3 | Issue date | DATE | R | Always |
| 3.4 | Expiry date | DATE | R | Always; after 3.3 and after the planned leave date in 1.7 |

### Part 4: Family

**4A. Spouse or partner details**

Shown only when the relationship status in 2.13 indicates a spouse or partner. The exact statuses that trigger it are to confirm.

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 4.1 | Given names | TXT | C | 2.13 indicates a spouse or partner |
| 4.2 | Family name | TXT | C | Same as 4.1 |
| 4.3 | Date of birth | DATE | C | Same as 4.1 |
| 4.4 | Country of nationality | CTRY | C | Same as 4.1 |
| 4.5 | Do they currently live with you? | YN | C | Same as 4.1 |
| 4.6 | Will they be travelling with you to the UK? | YN | C | Same as 4.1 |

**4B. Dependants**

One entry per person who relies on the applicant for financial support, whether or not they are travelling.

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 4.7 | Does anyone rely on you for financial support? Include both those travelling with you and those who are not. | YN | R | Always |
| 4.7a | What is this person's relationship to you? | SEL | C | 4.7 = Yes; repeating group 4.7a to 4.7f, Add another; options to confirm |
| 4.7b | Given names | TXT | C | Same group |
| 4.7c | Family name | TXT | C | Same group |
| 4.7d | Date of birth | DATE | C | Same group |
| 4.7e | Does this person currently live with you? | YN | C | Same group |
| 4.7f | Is this person travelling with you to the UK? | YN | C | Same group |

**4C. Parent details**

One entry per parent. Whether a Yes/No question opens this group, and whether exactly two entries are required, is to confirm.

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 4.8a | What is this person's relationship to you? | SEL | R | Repeating group 4.8a to 4.8f, Add another; options to confirm |
| 4.8b | Given names | TXT | R | Same group |
| 4.8c | Family name | TXT | R | Same group |
| 4.8d | Date of birth | DATE | R | Same group |
| 4.8e | Country of nationality | CTRY | R | Same group |
| 4.8f | Have they always had the same nationality? | YN | R | Same group; No path to confirm |

## Parts 5 and 6: Employment, money and stay in the UK

Part 5 shows how the applicant earns a living. Part 6 shows how the trip is funded and where they will stay.

### Part 5: Employment

The printout shows the questions for an employed applicant. The questions shown for any other employment status are to confirm, so 5.2 to 5.9 are written here as the employed path.

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 5.1 | What is your employment status? | SEL | R | Always; options to confirm; the answer decides which of 5.2 to 5.9 appear |
| 5.2 | Date you started working for this employer | MY | C | 5.1 = employed |
| 5.3 | Employer's name | TXT | C | 5.1 = employed |
| 5.4 | Employer's address | ADDR | C | 5.1 = employed |
| 5.5 | Employer's telephone number | TEL | C | 5.1 = employed |
| 5.6 | Your job title | TXT | C | 5.1 = employed |
| 5.7 | How much do you earn each month - after tax? | AMT | C | 5.1 = employed |
| 5.8 | Describe your job | LNG | C | 5.1 = employed |
| 5.9 | Previous employment organisation | To confirm | C | 5.1 = employed; the printout suggests a pick-list with a none-of-the-above choice, type and options to confirm |

### Part 6: Money, family in the UK and accommodation

**6A. Income and expenditure**

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 6.1 | Do you have another income or any savings? | SEL | R | Always; options to confirm; single or multiple choice to confirm |
| 6.2 | How much money do you have in savings? | AMT | C | 6.1 includes savings |
| 6.3 | How much money are you personally planning to spend on your visit to the UK? | AMT | R | Always |
| 6.4 | What is the total amount of money you spend each month? | AMT | R | Always |
| 6.5 | Will anyone be paying towards the cost of your visit? | YN | R | Always; Yes path to confirm |

**6B. Family in the UK**

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 6.6 | Do you have any family in the UK? | YN | R | Always; Yes path to confirm, likely one entry per relative |

**6C. Accommodation details**

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 6.7 | Do you have an address for where you are going to stay in the UK? | YN | R | Always; No path to confirm |
| 6.7a | Where are you planning to stay in the UK? | TXT | C | 6.7 = Yes; repeating group 6.7a to 6.7d, one entry per place, Add another |
| 6.7b | Enter the address for where you are staying | ADDR | C | Same group |
| 6.7c | When will you arrive there? | DATE | C | Same group; inside the dates in 1.6 and 1.7 |
| 6.7d | When will you leave there? | DATE | C | Same group; after 6.7c; proposed: the next stay starts when this one ends |

**6D. Public funds**

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 6.8 | Have you received any public funds (money) in the UK? | YN | R | Always; Yes path to confirm |

## Parts 7 and 8: Travel history

Part 7 covers past dealings with the UK and any immigration problems anywhere. Part 8 covers travel to other countries. Both look back 10 years and rely on repeating groups.

### Part 7: Travel history (UK)

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 7.1 | Have you been issued with a UK visa in the past 10 years? | YN | R | Always |
| 7.2 | Date of application | MY | C | 7.1 = Yes; one date or one entry per visa, to confirm |
| 7.3 | Have you applied for leave to remain in the UK in the past 10 years? | YN | R | Always; Yes path to confirm |
| 7.4 | Have you been to the UK in the past 10 years? | YN | R | Always |
| 7.5 | How many times have you been to the UK in the past 10 years? | NUM | C | 7.4 = Yes; sets how many visit entries 7.5a to 7.5c appear |
| 7.5a | Select why you were in the UK | SEL | C | 7.4 = Yes; one entry per visit; options to confirm |
| 7.5b | Date you arrived in the UK | MY | C | Same group |
| 7.5c | Number of days, weeks, months or years | DUR | C | Same group; length of that stay |
| 7.6 | Have you ever: entered the UK illegally; remained in the UK beyond the validity of your visa or permission to stay; breached the conditions of your leave, for example worked without permission or received public funds when you did not have permission; given false information when applying for a visa, leave to enter, or leave to remain; breached UK immigration law in any other way? | YN | R | Always; show the five items as a list under the question; Yes path to confirm |
| 7.7 | For either the UK or any other country, have you ever been: refused a visa; refused entry at the border; refused permission to stay or remain; refused asylum; deported; removed; required to leave; excluded or banned from entry? | YN | R | Always; show the eight items as a list under the question |
| 7.7a | Give details of what happened | SEL | C | 7.7 = Yes; repeating group 7.7a to 7.7d, Add another; options to confirm |
| 7.7b | Country | CTRY | C | Same group |
| 7.7c | When did this immigration problem happen? | MY | C | Same group |
| 7.7d | Give more details of what happened | LNG | C | Same group |

### Part 8: Travel history (other countries)

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 8.1 | How many times have you visited the following places in the past 10 years? Australia, Canada, New Zealand, USA, Switzerland, European Economic Area (do not include travel to the UK) | NUM | R | Always; one combined count; whether a count above zero opens follow-up entries is to confirm |
| 8.2 | Have you been to any other countries in the past 10 years? | YN | R | Always |
| 8.2a | Which country did you visit? | CTRY | C | 8.2 = Yes; repeating group 8.2a to 8.2d, one entry per trip, Add another |
| 8.2b | What was the reason for your visit? | SEL | C | Same group; options to confirm |
| 8.2c | When did you enter this country? | DATE | C | Same group |
| 8.2d | When did you leave this country? | DATE | C | Same group; after 8.2c |

The printout also shows a help list under 8.1, Which countries are part of the European Economic Area (EEA)?. The form needs a maintained country list for it.

## Parts 9 and 10: Security, penalties and closing questions

Part 9 is a block of security and character questions that are all Yes/No. Part 10 closes the application with penalties, free-text information, language, National Insurance number and documents.

### Part 9: Other history

The printout shows No for every question here, so the Yes path of each one is to confirm. A details box is assumed.

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 9.1 | Have you ever been involved in, suspected or convicted of sabotage or espionage? | YN | R | Always |
| 9.2 | In either peace or war time have you ever been involved in, or suspected of involvement in, war crimes, crimes against humanity, or genocide? | YN | R | Always |
| 9.3 | Have you ever been involved in, supported or encouraged terrorist activities in any country? | YN | R | Always |
| 9.4 | Have you ever been a member of, or given support to, an organisation which has been concerned in terrorism? | YN | R | Always |
| 9.5 | Have you, by any means or medium, expressed views that justify or glorify terrorist violence or that may encourage others to commit terrorist or other serious criminal acts? | YN | R | Always |
| 9.6 | Have you ever been a member of, or given support to, an organisation which is or has been concerned with extremism? | YN | R | Always |
| 9.7 | Have you, by any means or medium, expressed any extremist views? | YN | R | Always |
| 9.8 | Have you, as a part of your employment or otherwise, undertaken paid or unpaid activity on behalf of a non-UK government which you know to be dangerous to the interests or national security of the UK or its allies? | YN | R | Always |
| 9.9 | Have you ever engaged in any other activities which might indicate that you may not be considered to be a person of good character? | YN | R | Always |
| 9.10 | Is there any other information about your character or behaviour which you would like to make us aware of? | YN | R | Always |
| 9.11 | I have read all of the information about espionage and sabotage, including the guidance | ACK | R | Covers 9.1 |
| 9.12 | I have read all of the information about war crimes, including the guidance | ACK | R | Covers 9.2 |
| 9.13 | I have read all of the information about terrorist activities, organisations and views, including the guidance | ACK | R | Covers 9.3 to 9.5 |
| 9.14 | I have read all of the information about extremist organisations and views, including the guidance | ACK | R | Covers 9.6 and 9.7 |

On the printout each tick follows its group of questions. Proposed: show each tick and its guidance before the questions it covers, so the guidance is read first.

### Part 10: Penalties, extra information, language, National Insurance and documents

**10A. Convictions and other penalties**

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 10.1 | At any time have you ever had any of the following, in the UK or in another country? | CHK | R | Always; choices: a criminal conviction; a penalty for a driving offence, for example disqualification for speeding or no motor insurance; an arrest or charge for which you are currently on, or awaiting trial; a caution, warning, reprimand or other out-of-court penalty; a civil court judgment against you, for example for non payment of debt, bankruptcy proceedings or anti-social behaviour; a civil penalty issued under UK immigration law; plus one exclusive choice meaning none of these. Follow-up details for each ticked choice are to confirm |

**10B. Extra information**

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 10.2 | If you needed to add more information about your application but were not able to, you can write it here. If there is no further information you want to add, click Save and continue. | LNG | O | Always |
| 10.3 | Add further details | LNG | O | The printout shows a second box; whether it follows 10.2 or stands alone is to confirm |

**10C. Language and National Insurance number**

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 10.4 | We may have to talk to you about your application. Which language would you prefer to use? | SEL | R | Always; options to confirm |
| 10.5 | Do you have a UK National Insurance number? | YN | R | Always; Yes path to confirm, presumably the number |

**10D. Documents**

The printout lists the documents an applicant must provide but shows no upload step. Decided: applicants upload both documents in the form and cannot submit until both are attached.

| # | Question | Type | Req | Shows when / notes |
| --- | --- | --- | --- | --- |
| 10.6 | Mandatory document: the applicant's passport or travel document | FILE | R | Always |
| 10.7 | Other documents: evidence of funds available to you, and which are clearly accessible by you | FILE | R | Always; several files allowed; required before submit |

Applicants can save a draft without the documents. Proposed limits: PDF, JPG or PNG, about 5 MB per file, several files allowed for 10.7. Files are stored privately and opened through expiring links. The upload step reuses the documents step of the existing assessment form.

## Gaps to confirm

The printout cannot answer the points below, and none of them has been guessed. The quickest fix is one pass through the live form with a dummy applicant, answering Yes to every gate and opening every dropdown. That shows each follow-up question and option list without using any real client data.

**Follow-ups for answers not shown on the printout**

| Question | What is missing |
| --- | --- |
| 1.2, 1.3 | Follow-up when travelling in a group or with someone else |
| 2.23 | Follow-up when another nationality is held |
| 2.30 | Follow-up when a UK driving licence is held |
| 2.31 | Follow-up when medical treatment in the UK is declared |
| 4.8f | Follow-up when a parent's nationality has changed |
| 6.5 | Who is paying and how much |
| 6.6 | Details of family in the UK |
| 6.7 | What is asked when the applicant has no UK address |
| 6.8 | Follow-up when public funds were received |
| 7.3 | Details of a leave to remain application |
| 7.6 | Follow-up when any of the five breaches applies |
| 8.1 | Whether a count above zero opens follow-up entries |
| 9.1 to 9.10 | Follow-up when any answer is Yes |
| 10.1 | Follow-up for each ticked penalty |
| 10.5 | The number field when the answer is Yes |

**Conditions, structure and content**

| Item | Open point |
| --- | --- |
| 2.13 | Which relationship statuses show the spouse or partner questions in 4A |
| 2.28 and 2.29 | Which ownership choices show the living-situation details box |
| 2.3a, 2.3b, 2.7 | Fields in the other-names group, and one or several additional email addresses |
| 4.8 | Whether a Yes/No question opens the parent group, and how many parents are required |
| 5.1 | Questions shown for each employment status other than employed |
| 5.9 | Answer type and options of the previous employment question |
| 7.2 | A single date or one entry per UK visa |
| 10.3 | Whether it follows 10.2 or stands alone |
| 10.7 | Resolved: both documents are uploaded in the form and required before submit. File types and size limits are still to confirm |
| Option lists | Values for 1.1, 1.4, 2.5, 2.12, 2.13, 2.28, 2.33, 2.35, 4.7a, 4.8a, 5.1, 6.1, 7.5a, 7.7a, 8.2b and 10.4 |
| Limits | Maximum entries per repeating group, character limit for long text, accepted file types and size |
| Guidance text | For 9.11 to 9.14: link to the official guidance pages or write our own wording |
| Hidden labels | A few rows on the printout were partly covered by redaction, so their wording is confirmed on the dummy run |

## Build notes

The form should be built from one question config instead of hand-coded screens, so closing the gaps above means editing data, not rebuilding pages.

**Config-driven design**

- Each question is one config entry: number, section, label, type, required, showWhen, options and, for repeating groups, a group name. The tables in this spec map one-to-one onto those entries.
- One generic form component in the Next.js client reads the config and renders each section, including conditions and Add another.
- The Express backend builds its Zod validation from the same config, so each rule is defined once and the client and server cannot disagree.

**Data model**

One document per application in MongoDB, following the existing routes, controllers, services, repositories and models layering.

| Field | Purpose |
| --- | --- |
| applicant | The signed-in user who owns the application |
| visaType | Tourist, fixed for this version |
| status | Draft, submitted, in review, completed; list to confirm |
| currentSection | Where the applicant resumes |
| answers | All answers keyed by question number; repeating groups stored as lists of entries |
| documents | References to uploaded files |
| timestamps and submittedAt | Audit trail |

The header block on the printout (applicant name, application number, passport number, nationality, date of birth, visa type, date of application, submission method, contact email and language) is generated from the answers, not asked as questions. Fee, service option and payment reference are entered by the admin if needed; to confirm.

**Access and protection of sensitive data**

This form stores passport and ID numbers, family details and security-history answers, so it needs stricter handling than the existing forms.

- Applicants can read and edit only their own application, and only while it is a draft.
- Admins can read all applications. No other role can.
- Encrypt the highest-risk fields at rest: passport and ID numbers, and the Part 9 and 10A answers.
- Store uploaded documents as private files with expiring links, not public URLs.
- Never write answers to logs, error reports or analytics.
- Use only dummy applicants in development, testing and demos. Real client data stays out of the repository and out of chat tools.
- Agree a retention period and a privacy notice with the client before launch; to confirm.

**Proposed build order**

1. Resolve the gaps above with a dummy run of the live form, then issue version 2 of this spec.
2. Build the config format, the generic form renderer and save-and-resume, proven on Parts 1 and 2.
3. Add the backend model, routes, validation and draft handling.
4. Add Yes/No conditions and repeating groups, then Parts 3 to 8.
5. Add Parts 9 and 10, including document upload, reusing the upload step of the existing assessment form.
6. Add the review page and final submit.
7. Add the admin view and PDF export in the printout's layout.
8. Run a security review, then test with dummy applicants.
