"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAssessmentForm = void 0;
var react_1 = require("react");
var react_redux_1 = require("react-redux");
var formSubmissionSlice_1 = require("@/redux/slices/formSubmission/formSubmissionSlice");
var zod_1 = require("zod");
var fileValidationSchema = zod_1.z.object({
    size: zod_1.z.number().max(10 * 1024 * 1024, 'File size must be less than 10MB'),
    type: zod_1.z.string().refine(function (type) { return ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(type); }, 'File type not supported'),
});
var formStep1Schema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Name is required'),
    email: zod_1.z.string().email('Invalid email address'),
    phone: zod_1.z.string().min(1, 'Phone number is required'),
});
var formStep2Schema = zod_1.z.object({
    destinationCountry: zod_1.z.string().min(1, 'Destination country is required'),
    visaType: zod_1.z.string().min(1, 'Visa type is required'),
    fromDate: zod_1.z.string().min(1, 'From date is required'),
    toDate: zod_1.z.string().min(1, 'To date is required'),
    purpose: zod_1.z.string().min(1, 'Purpose is required'),
    otherCountry: zod_1.z.string().optional(),
}).refine(function (data) {
    if (data.destinationCountry === 'Other') {
        return data.otherCountry && data.otherCountry.length > 0;
    }
    return true;
}, {
    message: 'Please specify the country',
    path: ['otherCountry'],
});
var renameSelectedFile = function (field, file, index, totalFiles) {
    var extensionMatch = file.name.match(/(\.[^\.]+)$/);
    var extension = extensionMatch ? extensionMatch[1] : '';
    var baseName = totalFiles > 1 ? "".concat(field, "-").concat(index + 1) : field;
    return new File([file], "".concat(baseName).concat(extension), { type: file.type, lastModified: file.lastModified });
};
var useAssessmentForm = function (onClose) {
    var dispatch = (0, react_redux_1.useDispatch)();
    var user = (0, react_redux_1.useSelector)(function (state) { return state.auth; }).user;
    var _a = (0, react_redux_1.useSelector)(function (state) { return state.formSubmission; }), isSubmitting = _a.isSubmitting, error = _a.error, success = _a.success;
    var _b = (0, react_1.useState)({
        name: '',
        email: '',
        phone: '',
        destinationCountry: '',
        otherCountry: '',
        visaType: '',
        fromDate: '',
        toDate: '',
        purpose: '',
        passports: [],
        businessBankStatement: [],
        personalBankStatement: [],
        businessRegistration: [],
        taxpayerCertificate: [],
        incomeTaxReturns: [],
        propertyDocuments: [],
        frcFamily: [],
        frcParents: [],
        marriageCertificate: [],
        invitationLetter: [],
        flightReservation: [],
        hotelReservation: [],
        anyOtherDocuments: [],
        coverLetter: [],
    }), formData = _b[0], setFormData = _b[1];
    var _c = (0, react_1.useState)(1), currentStep = _c[0], setCurrentStep = _c[1];
    var _d = (0, react_1.useState)({}), validationErrors = _d[0], setValidationErrors = _d[1];
    (0, react_1.useEffect)(function () {
        if (user) {
            setFormData(function (prev) { return (__assign(__assign({}, prev), { name: user.name || '', email: user.email || '', phone: user.phone || '' })); });
        }
    }, [user]);
    (0, react_1.useEffect)(function () {
        return function () {
            dispatch((0, formSubmissionSlice_1.resetFormSubmission)());
        };
    }, [dispatch]);
    var validateStep = (0, react_1.useCallback)(function (step) {
        setValidationErrors({});
        var errors = {};
        if (step === 1) {
            var result = formStep1Schema.safeParse({
                name: formData.name,
                email: formData.email,
                phone: formData.phone,
            });
            if (!result.success) {
                result.error.issues.forEach(function (issue) {
                    if (issue.path[0]) {
                        errors[issue.path[0].toString()] = issue.message;
                    }
                });
            }
        }
        if (step === 2) {
            var result = formStep2Schema.safeParse({
                destinationCountry: formData.destinationCountry,
                visaType: formData.visaType,
                fromDate: formData.fromDate,
                toDate: formData.toDate,
                purpose: formData.purpose,
                otherCountry: formData.otherCountry,
            });
            if (!result.success) {
                result.error.issues.forEach(function (issue) {
                    if (issue.path[0]) {
                        errors[issue.path[0].toString()] = issue.message;
                    }
                });
            }
        }
        if (step === 3) {
            if (formData.passports.length === 0) {
                errors.passports = 'Please upload at least one passport document.';
            }
            if (formData.flightReservation.length === 0 && formData.hotelReservation.length === 0) {
                errors.flightReservation = 'Please upload a flight or hotel reservation.';
            }
        }
        if (Object.keys(errors).length > 0) {
            setValidationErrors(errors);
            return false;
        }
        return true;
    }, [formData]);
    var handleInputChange = (0, react_1.useCallback)(function (e) {
        var _a = e.target, name = _a.name, value = _a.value;
        setFormData(function (prev) {
            var _a;
            return (__assign(__assign({}, prev), (_a = {}, _a[name] = value, _a)));
        });
        // Clear validation error for this field
        if (validationErrors[name]) {
            setValidationErrors(function (prev) {
                var newErrors = __assign({}, prev);
                delete newErrors[name];
                return newErrors;
            });
        }
    }, [validationErrors]);
    var handleFileChange = (0, react_1.useCallback)(function (field) {
        return function (e) {
            if (!e.target.files)
                return;
            var filesArray = Array.from(e.target.files);
            var errors = [];
            var validFiles = [];
            filesArray.forEach(function (file) {
                var _a;
                var validation = fileValidationSchema.safeParse({
                    size: file.size,
                    type: file.type,
                });
                if (!validation.success) {
                    errors.push("".concat(file.name, ": ").concat(((_a = validation.error.issues[0]) === null || _a === void 0 ? void 0 : _a.message) || 'Invalid file'));
                }
                else {
                    validFiles.push(file);
                }
            });
            if (errors.length > 0) {
                // File validation errors are handled locally, not through Redux
                // The error message will be shown via notification in the component
                return;
            }
            if (validFiles.length > 0) {
                var renamedFiles_1 = validFiles.map(function (file, index) { return renameSelectedFile(field.toString(), file, index, validFiles.length); });
                setFormData(function (prev) {
                    var _a;
                    return (__assign(__assign({}, prev), (_a = {}, _a[field] = __spreadArray(__spreadArray([], prev[field], true), renamedFiles_1, true), _a)));
                });
            }
        };
    }, [dispatch]);
    var removeFile = (0, react_1.useCallback)(function (field, index) {
        setFormData(function (prev) {
            var _a;
            return (__assign(__assign({}, prev), (_a = {}, _a[field] = prev[field].filter(function (_, i) { return i !== index; }), _a)));
        });
    }, []);
    var handleNextStep = (0, react_1.useCallback)(function () {
        if (validateStep(currentStep)) {
            setCurrentStep(function (prev) { return Math.min(prev + 1, 3); });
        }
    }, [currentStep, validateStep]);
    var handlePreviousStep = (0, react_1.useCallback)(function () {
        setCurrentStep(function (prev) { return Math.max(1, prev - 1); });
    }, []);
    var handleSubmit = (0, react_1.useCallback)(function (e) { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    e.preventDefault();
                    if (currentStep < 3) {
                        if (validateStep(currentStep)) {
                            setCurrentStep(function (prev) { return Math.min(prev + 1, 3); });
                        }
                        return [2 /*return*/];
                    }
                    if (!validateStep(1)) {
                        setCurrentStep(1);
                        return [2 /*return*/];
                    }
                    if (!validateStep(2)) {
                        setCurrentStep(2);
                        return [2 /*return*/];
                    }
                    if (!validateStep(3)) {
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, dispatch((0, formSubmissionSlice_1.submitAssessmentForm)(formData))];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); }, [currentStep, dispatch, formData, validateStep]);
    return {
        formData: formData,
        currentStep: currentStep,
        validationErrors: validationErrors,
        isSubmitting: isSubmitting,
        error: error,
        success: success,
        handleInputChange: handleInputChange,
        handleFileChange: handleFileChange,
        removeFile: removeFile,
        handleNextStep: handleNextStep,
        handlePreviousStep: handlePreviousStep,
        handleSubmit: handleSubmit,
        setCurrentStep: setCurrentStep,
    };
};
exports.useAssessmentForm = useAssessmentForm;
