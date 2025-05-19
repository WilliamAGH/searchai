"""
Test cases for application functionality
:author: William Callahan
"""
import unittest
from unittest import mock # Import mock directly
from app.moduleA import func1, func2
from app.moduleB import ClassY

class TestFunc1(unittest.TestCase):
    def test_func1_happy_path(self):
        # typical valid inputs for func1 (e.g., two integers)
        result = func1(3, 5)
        self.assertEqual(result, 8)

    def test_func1_edge_case(self):
        # boundary values for func1 (e.g., zeros)
        result = func1(0, 0)
        self.assertEqual(result, 0)

    def test_func1_invalid_type(self):
        # passing wrong types should raise TypeError
        with self.assertRaises(TypeError):
            func1('a', 'b')

class TestFunc2(unittest.TestCase):
    def test_func2_happy_path(self):
        # typical valid inputs for func2 (e.g., a list to reverse)
        result = func2([1, 2, 3])
        self.assertEqual(result, [3, 2, 1])

    def test_func2_edge_case(self):
        # boundary value for func2 (e.g., empty list)
        result = func2([])
        self.assertEqual(result, [])

    def test_func2_invalid_type(self):
        # passing wrong type should raise TypeError
        with self.assertRaises(TypeError):
            func2(123)

class TestClassY(unittest.TestCase):
    def setUp(self):
        # Patch external_dependency on ClassY
        patcher = mock.patch('app.moduleB.ClassY.external_dependency') # Use imported mock
        self.mock_ext = patcher.start()
        self.addCleanup(patcher.stop)
        self.instance = ClassY()

    def test_method_alpha_happy_path(self):
        # external_dependency returns a value that method_alpha should forward
        self.mock_ext.return_value = 'mocked_result'
        output = self.instance.method_alpha('input_value')
        self.mock_ext.assert_called_once_with('input_value')
        self.assertEqual(output, 'mocked_result')

    def test_method_alpha_error_propagates(self):
        # if external_dependency raises, method_alpha should propagate the exception
        self.mock_ext.side_effect = ValueError('dependency failed')
        with self.assertRaises(ValueError):
            self.instance.method_alpha('input_value')

if __name__ == '__main__':
    unittest.main(verbosity=2)
