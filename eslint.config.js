import globals from "globals";

export default [
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
        env: "readonly",
        MD5: "readonly",
        KV_NAMESPACE: "readonly"
      },
      ecmaVersion: 2022,
      sourceType: "module"
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }]
    }
  }
];
