Do not use JavaScript's maximum safe integer (9007199254740991) as a maximum in schemas or code checks. If there is no known meaningful maximum, omit it.

When requirements change, especially when a requirement is removed, do not add a test for the changed behavior unless it would warrant a test independently. If in doubt, ask first.
