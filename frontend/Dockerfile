FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts scripts
RUN npm ci  # its postinstall copies the pdf.js worker, so scripts/ must be here first
COPY . .
# The browser talks to the API directly, so this is the address as the browser sees it.
ARG NEXT_PUBLIC_API_BASE=http://localhost:8000
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
CMD ["npm", "run", "start"]
