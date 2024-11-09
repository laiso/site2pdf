#!/usr/bin/env node

import { main } from '../dist/index.js';

const [,, mainUrl, urlPattern] = process.argv;

main(mainUrl, urlPattern);
