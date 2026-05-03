"use strict";
// src/redux/slices/formSubmission/formSubmissionService.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renameDocument = exports.getCustomerSubmission = exports.submitAssessment = void 0;
var API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
var getRenamedFile = function (field, file, index, totalFiles) {
    var extensionMatch = file.name.match(/(\.[^\.]+)$/);
    var extension = extensionMatch ? extensionMatch[1] : '';
    var baseName = totalFiles > 1 ? "".concat(field, "-").concat(index + 1) : field;
    var newFileName = "".concat(baseName).concat(extension);
    return new File([file], newFileName, { type: file.type, lastModified: file.lastModified });
};
// ✅ Submit assessment form
var submitAssessment = function (formData) { return __awaiter(void 0, void 0, void 0, function () {
    var formDataToSend, response, errorData, data;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                formDataToSend = new FormData();
                // Add text fields
                Object.entries(formData).forEach(function (_a) {
                    var key = _a[0], value = _a[1];
                    if (Array.isArray(value)) {
                        var files_1 = value;
                        files_1.forEach(function (file, index) {
                            var renamedFile = getRenamedFile(key, file, index, files_1.length);
                            formDataToSend.append(key, renamedFile);
                        });
                    }
                    else {
                        // Handle text fields
                        formDataToSend.append(key, value);
                    }
                });
                return [4 /*yield*/, fetch("".concat(API_URL, "/submit-assessment"), {
                        method: 'POST',
                        body: formDataToSend,
                    })];
            case 1:
                response = _a.sent();
                if (!!response.ok) return [3 /*break*/, 3];
                return [4 /*yield*/, response.json()];
            case 2:
                errorData = _a.sent();
                throw new Error(errorData.message || 'Form submission failed');
            case 3: return [4 /*yield*/, response.json()];
            case 4:
                data = _a.sent();
                return [2 /*return*/, data];
        }
    });
}); };
exports.submitAssessment = submitAssessment;
// ✅ Get customer submission
var getCustomerSubmission = function (email) { return __awaiter(void 0, void 0, void 0, function () {
    var response, errorData, data;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, fetch("".concat(API_URL, "/form-submissions/customer-submission/").concat(email), {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                })];
            case 1:
                response = _a.sent();
                if (!!response.ok) return [3 /*break*/, 3];
                return [4 /*yield*/, response.json()];
            case 2:
                errorData = _a.sent();
                throw new Error(errorData.message || 'Failed to fetch submission');
            case 3: return [4 /*yield*/, response.json()];
            case 4:
                data = _a.sent();
                return [2 /*return*/, data];
        }
    });
}); };
exports.getCustomerSubmission = getCustomerSubmission;
// ✅ Rename document
var renameDocument = function (submissionId, documentId, newName) { return __awaiter(void 0, void 0, void 0, function () {
    var token, headers, response, errorData, data;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
                headers = {
                    'Content-Type': 'application/json',
                };
                if (token) {
                    headers['Authorization'] = "Bearer ".concat(token);
                }
                return [4 /*yield*/, fetch("".concat(API_URL, "/form-submissions/").concat(submissionId, "/documents/").concat(documentId, "/rename"), {
                        method: 'PUT',
                        headers: headers,
                        credentials: 'include',
                        body: JSON.stringify({ newName: newName }),
                    })];
            case 1:
                response = _a.sent();
                if (!!response.ok) return [3 /*break*/, 3];
                return [4 /*yield*/, response.json().catch(function () { return ({}); })];
            case 2:
                errorData = _a.sent();
                throw new Error(errorData.message || 'Failed to rename document');
            case 3: return [4 /*yield*/, response.json()];
            case 4:
                data = _a.sent();
                return [2 /*return*/, data];
        }
    });
}); };
exports.renameDocument = renameDocument;
