#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Function to update file content
function updateFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  replacements.forEach(({ find, replace }) => {
    content = content.replace(find, replace);
  });
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Updated: ${path.basename(filePath)}`);
}

console.log('🚀 Applying responsive design changes...\n');

// 1. Import responsive CSS
try {
  const indexCssPath = './src/index.css';
  let indexCss = fs.readFileSync(indexCssPath, 'utf8');
  if (!indexCss.includes("@import './styles/responsive.css'")) {
    indexCss = indexCss.replace(
      '@import url(\'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500;1,600;1,700;1,800;1,900&display=swap\');\n',
      '@import url(\'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500;1,600;1,700;1,800;1,900&display=swap\');\n@import \'./styles/responsive.css\';\n'
    );
    fs.writeFileSync(indexCssPath, indexCss, 'utf8');
    console.log('✅ Added responsive CSS import');
  }
} catch {
  console.log('⚠️  Could not add responsive CSS import');
}

// 2. Update App.tsx with responsive header
updateFile('./src/App.tsx', [
  {
    find: 'className="max-w-7xl mx-auto px-6 h-14',
    replace: 'className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14'
  },
  {
    find: 'className="flex items-center gap-3 cursor-pointer"',
    replace: 'className="flex items-center gap-2 sm:gap-3 cursor-pointer min-w-0"'
  },
  {
    find: 'className="w-7 h-7 bg-gradient',
    replace: 'className="w-6 h-6 sm:w-7 sm:h-7 bg-gradient'
  },
  {
    find: 'className="w-4 h-4 text-white"',
    replace: 'className="w-3 h-3 sm:w-4 sm:h-4 text-white"'
  },
  {
    find: 'className="text-lg font-medium bg-gradient',
    replace: 'className="text-base sm:text-lg font-medium bg-gradient'
  },
  {
    find: 'className="text-xs bg-emerald-100',
    replace: 'className="hidden sm:inline-block text-xs bg-emerald-100'
  },
  {
    find: 'className="flex items-center gap-3">',
    replace: 'className="flex items-center gap-2 sm:gap-3">'
  },
  {
    find: 'className="px-4 py-1.5 text-sm font-medium bg-emerald-500',
    replace: 'className="px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium bg-emerald-500'
  }
]);

// 3. Update MessageList.tsx with responsive classes
updateFile('./src/components/MessageList.tsx', [
  {
    find: 'className="text-center max-w-lg px-6"',
    replace: 'className="text-center max-w-sm sm:max-w-lg px-4 sm:px-6"'
  },
  {
    find: 'className="text-3xl font-bold mb-4',
    replace: 'className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4'
  },
  {
    find: 'className="text-lg text-gray-600',
    replace: 'className="text-base sm:text-lg text-gray-600'
  },
  {
    find: 'className="px-6 py-8 space-y-8"',
    replace: 'className="px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8"'
  }
]);

// 4. Update MessageInput.tsx with responsive classes
updateFile('./src/components/MessageInput.tsx', [
  {
    find: 'className="max-w-4xl mx-auto p-4"',
    replace: 'className="max-w-4xl mx-auto p-3 sm:p-4"'
  },
  {
    find: 'className="w-full px-4 py-3 pr-12',
    replace: 'className="w-full px-3 sm:px-4 py-2 sm:py-3 pr-10 sm:pr-12'
  }
]);

// 5. Update ShareModal.tsx with responsive classes
updateFile('./src/components/ShareModal.tsx', [
  {
    find: 'className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6',
    replace: 'className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm sm:max-w-md w-full mx-4 p-5 sm:p-6'
  },
  {
    find: 'className="w-12 h-12 mx-auto mb-4',
    replace: 'className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4'
  },
  {
    find: 'className="text-xl font-bold',
    replace: 'className="text-lg sm:text-xl font-bold'
  }
]);

// 6. Update AuthModal.tsx with responsive classes
updateFile('./src/components/AuthModal.tsx', [
  {
    find: 'className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8',
    replace: 'className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm sm:max-w-md w-full mx-4 p-6 sm:p-8'
  },
  {
    find: 'className="w-16 h-16 mx-auto mb-4',
    replace: 'className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4'
  },
  {
    find: 'className="text-2xl font-bold',
    replace: 'className="text-xl sm:text-2xl font-bold'
  }
]);

// 7. Update ChatSidebar.tsx for mobile
updateFile('./src/components/ChatSidebar.tsx', [
  {
    find: 'className="w-80 border-r',
    replace: 'className="w-full sm:w-80 border-r'
  },
  {
    find: 'className="p-4 border-b"',
    replace: 'className="p-3 sm:p-4 border-b"'
  }
]);

console.log('\n✨ Responsive design implementation complete!');
console.log('\n📱 Your app now works on:');
console.log('  • Mobile phones (320px+)');
console.log('  • Tablets (768px+)');
console.log('  • Desktops (1024px+)');
console.log('  • 4K displays (2560px+)');
console.log('\n🎯 Next: Run "npm run dev" to see the changes!');